"""doctor.ai AI doctor: LiveKit agent using Gemini Live with camera input."""

import logging
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    cli,
    function_tool,
    get_job_context,
    room_io,
)
from livekit.plugins import google

load_dotenv()

from medical_search import MedicalSearch, format_sources_markdown  # noqa: E402  needs GOOGLE_API_KEY

logger = logging.getLogger("saathi")

INSTRUCTIONS = (Path(__file__).parent / "saathi_prompt.md").read_text(encoding="utf-8")

# Topic the frontend's chat transcript listens on.
CHAT_TOPIC = "lk.chat"


class SaathiDoctor(Agent):
    def __init__(self, instructions: str = INSTRUCTIONS) -> None:
        super().__init__(instructions=instructions)
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
            "\n\nThe patient filled in these notes before the call. Use them, confirm the main"
            " concern briefly, and don't ask for details they already gave:\n" + brief
        )

    session = AgentSession(
        llm=google.realtime.RealtimeModel(model="gemini-3.8-live", voice="Puck"),
    )
    await session.start(
        agent=SaathiDoctor(instructions),
        room=ctx.room,
        # Video input is off by default in LiveKit Agents; turn on the patient's camera feed.
        room_options=room_io.RoomOptions(video_input=True),
    )
    await session.generate_reply(
        instructions=(
            "Greet the patient by name, say you are doctor.ai, an AI doctor and not a "
            "substitute for an in-person doctor, then briefly confirm the concern from "
            "their notes."
            if brief
            else "Greet the patient warmly, say you are doctor.ai, an AI doctor and not a "
            "substitute for an in-person doctor, then ask what brings them in today."
        )
    )


if __name__ == "__main__":
    cli.run_app(server)
