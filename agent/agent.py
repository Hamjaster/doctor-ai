"""doctor.ai AI doctor: LiveKit agent using Gemini Live with camera input, with fallbacks."""

import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    APIConnectOptions,
    CloseEvent,
    CloseReason,
    JobContext,
    RunContext,
    cli,
    function_tool,
    get_job_context,
    inference,
    llm,
    room_io,
    stt,
    tts,
)
from livekit.plugins import deepgram, google, openai, silero

load_dotenv()

from medical_search import MedicalSearch, format_sources_markdown  # noqa: E402  needs GOOGLE_API_KEY
from nearby_hospitals import (  # noqa: E402
    describe_for_agent,
    find_hospitals,
    format_hospitals_markdown,
    geocode,
    parse_location,
)

logger = logging.getLogger("saathi")

INSTRUCTIONS = (Path(__file__).parent / "saathi_prompt.md").read_text(encoding="utf-8")

# Topic the frontend's chat transcript listens on.
CHAT_TOPIC = "lk.chat"

# Realtime models, tried in order; when one fails mid-call the next takes over with the
# conversation so far. Names with a "/" go through LiveKit Inference, billed to LiveKit Cloud
# instead of the Google key, so they still work when the Gemini quota runs out.
LIVE_MODELS = os.getenv(
    "SAATHI_LIVE_MODELS",
    "gemini-3.8-live,gemini-2.5-flash-native-audio-latest,openai/gpt-realtime-2.1-mini",
).split(",")
# Fail over quickly: the patient is waiting on a live call.
LIVE_CONNECT_OPTIONS = APIConnectOptions(max_retry=1, retry_interval=1.0, timeout=10.0)
# If every realtime model fails, the call carries on as a speech-to-text, LLM, text-to-speech
# pipeline. It can't see the camera. Set SAATHI_VOICE=pipeline to start with it.
PIPELINE_LLMS = os.getenv(
    "SAATHI_PIPELINE_LLMS", "google/gemini-3.8-flash,openai/gpt-4.1-mini"
).split(",")  # through OpenRouter


def _realtime_model(name: str) -> llm.RealtimeModel:
    if "/" in name:
        return inference.RealtimeModel(name, conn_options=LIVE_CONNECT_OPTIONS)
    return google.realtime.RealtimeModel(model=name, voice="Puck", conn_options=LIVE_CONNECT_OPTIONS)


def _realtime_session() -> AgentSession:
    return AgentSession(
        llm=llm.RealtimeModelFallbackAdapter([_realtime_model(m) for m in LIVE_MODELS])
    )


def _pipeline_session() -> AgentSession:
    # Each stage has a backup on a different account: Deepgram's own API, then LiveKit Inference.
    llms: list[llm.LLM] = []
    if os.getenv("OPENROUTER_API_KEY"):
        llms.append(
            openai.LLM.with_openrouter(model=PIPELINE_LLMS[0], fallback_models=PIPELINE_LLMS[1:])
        )
    llms += [google.LLM(model="gemini-flash-lite-latest"), inference.LLM("google/gemini-2.5-flash")]
    return AgentSession(
        stt=stt.FallbackAdapter(
            [
                deepgram.STT(model="nova-3", language="multi"),
                inference.STT("deepgram/nova-3", language="multi"),
            ]
        ),
        llm=llm.FallbackAdapter(llms),
        tts=tts.FallbackAdapter(
            [deepgram.TTS(model="aura-2-orion-en"), inference.TTS("cartesia/sonic-3")]
        ),
        vad=silero.VAD.load(),
    )


class SaathiDoctor(Agent):
    def __init__(
        self, instructions: str = INSTRUCTIONS, chat_ctx: llm.ChatContext | None = None
    ) -> None:
        super().__init__(instructions=instructions, chat_ctx=chat_ctx)
        self._search = MedicalSearch()

    @function_tool
    async def look_up_medical_guidance(
        self, context: RunContext, question: str, keywords: str
    ) -> str:
        """Search trusted medical sources on the web for current guidance.

        Use this when you are unsure, when the patient asks about a specific medicine,
        dose, interaction, condition, or guideline, or when current advice matters.
        Tell the patient you're checking before calling it.

        Args:
            question: The clinical question in one sentence, including relevant patient
                details such as age group, pregnancy, or conditions.
            keywords: Two to five plain search keywords, such as "ibuprofen pregnancy".
        """
        result = await self._search.look_up(question, keywords)
        logger.info("lookup via %s: %d sources", result.provider, len(result.sources))

        if result.sources:
            try:
                room = get_job_context().room
                await room.local_participant.send_text(
                    format_sources_markdown(result), topic=CHAT_TOPIC
                )
            except Exception as e:
                logger.warning("could not post sources to chat: %s", e)

        source_names = "; ".join(s.title for s in result.sources) or "none found"
        return (
            f"Findings: {result.answer}\n\n"
            f"Sources: {source_names}\n\n"
            "Explain this to the patient in your own words, mention which source it "
            "comes from by name, and tell them the links are in the chat."
        )

    @function_tool
    async def find_nearby_hospitals(self, context: RunContext, area: str = "") -> str:
        """Find the hospitals nearest the patient, with distance and directions.

        Use this in an emergency, right after telling the patient to call for help, or
        whenever the patient needs to go to a hospital and asks where. Uses the location
        shared by the patient's browser.

        Args:
            area: Only if the patient's location isn't shared: the area and city they say
                they're in, such as "Gulberg, Lahore". Leave empty otherwise.
        """
        room = get_job_context().room
        shared = next(
            (
                p.attributes["saathi.location"]
                for p in room.remote_participants.values()
                if p.attributes.get("saathi.location")
            ),
            "",
        )
        point = parse_location(shared) if shared else None
        near = "the patient's current location"
        if point is None and area.strip():
            point, near = await geocode(area), area.strip()
        if point is None:
            return (
                "The patient's location isn't available. Ask them which area and city they're "
                "in, then call this again with it. If it's an emergency, they should call 1122 "
                "or their local emergency number now; don't wait for this."
            )

        result = await find_hospitals(*point, near=near)
        logger.info("hospitals via %s: %d found", result.provider, len(result.hospitals))
        if not result.hospitals:
            return (
                f"No hospitals were found near {near}. Tell the patient to call 1122 or their "
                "local emergency number, who can send an ambulance or direct them."
            )
        try:
            await room.local_participant.send_text(
                format_hospitals_markdown(result), topic=CHAT_TOPIC
            )
        except Exception as e:
            logger.warning("could not post hospitals to chat: %s", e)
        return (
            f"Hospitals near {near}, nearest first:\n{describe_for_agent(result)}\n\n"
            "Tell the patient the nearest one or two by name and how far they are, and that "
            "the list with directions is on their screen. In an emergency, keep it short and "
            "remind them that calling 1122 or their local emergency number for an ambulance "
            "comes first."
        )


server = AgentServer()


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    # The web app sends the patient's intake as the `saathi.brief` participant attribute.
    # Read it before starting so doctor.ai opens with the notes instead of asking again.
    await ctx.connect()
    patient = await ctx.wait_for_participant()
    brief = patient.attributes.get("saathi.brief", "").strip()
    instructions = INSTRUCTIONS
    if brief:
        instructions += (
            "\n\nThe patient filled in these notes before the call. Use them, and don't ask for"
            " details they already gave. Take their health background into account:\n" + brief
        )

    async def start_pipeline(history: llm.ChatContext | None = None) -> AgentSession:
        session = _pipeline_session()
        await session.start(agent=SaathiDoctor(instructions, history), room=ctx.room)
        return session

    if os.getenv("SAATHI_VOICE") == "pipeline":
        session = await start_pipeline()
    else:
        session = _realtime_session()
        handover: list[asyncio.Task[None]] = []

        @session.on("close")
        def _on_close(ev: CloseEvent) -> None:
            # Every realtime model failed. Carry on in the same room without the camera.
            if ev.reason != CloseReason.ERROR or not ctx.room.isconnected():
                return
            logger.error("all realtime models failed (%s), switching to the voice pipeline", ev.error)
            history = session.history.copy(exclude_function_call=True, exclude_instructions=True)

            async def resume() -> None:
                fallback = await start_pipeline(history)
                fallback.generate_reply(
                    instructions="Apologise briefly for the connection hiccup, say you can't see "
                    "their camera for the rest of the call, and carry on from where you left off."
                )

            # Keep a reference so the task isn't garbage collected before it runs.
            handover.append(asyncio.create_task(resume()))

        await session.start(
            agent=SaathiDoctor(instructions),
            room=ctx.room,
            # Video input is off by default in LiveKit Agents; turn on the patient's camera feed.
            room_options=room_io.RoomOptions(video_input=True),
        )
    await session.generate_reply(
        instructions=(
            "Greet the patient by name and say you are doctor.ai. If their notes include an earlier WhatsApp "
            "chat, say you've read it and pick up from where it left off; if they include a "
            "concern, briefly confirm it; otherwise ask what brings them in today. Keep it to "
            "two sentences."
            if brief
            else "Greet the patient warmly, say you are doctor.ai, then ask what brings them in "
            "today."
        )
    )


if __name__ == "__main__":
    cli.run_app(server)
