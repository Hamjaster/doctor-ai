"""Saathi AI doctor: LiveKit agent using Gemini Live with camera input."""

from dotenv import load_dotenv
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, cli, room_io
from livekit.plugins import google

load_dotenv()

INSTRUCTIONS = """You are Saathi, a friendly AI doctor on a live video call.
You can see the patient's camera. Ask about their symptoms, ask them to show
the affected area to the camera, describe what you see, and explain what it
might be in plain language. Ask follow-up questions like a real doctor would.
Keep replies short and conversational. Always say you are an AI and not a
substitute for an in-person doctor, and urge emergency care for red-flag
symptoms such as chest pain, trouble breathing, or heavy bleeding."""

server = AgentServer()


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    # The web app sends the patient's intake as the `saathi.brief` participant attribute.
    # Read it before starting so Saathi opens with the notes instead of asking again.
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
        agent=Agent(instructions=instructions),
        room=ctx.room,
        # Video input is off by default in LiveKit Agents; turn on the patient's camera feed.
        room_options=room_io.RoomOptions(video_input=True),
    )
    await session.generate_reply(
        instructions=(
            "Greet the patient by name and check the concern from their notes."
            if brief
            else "Greet the patient and ask what brings them in today."
        )
    )


if __name__ == "__main__":
    cli.run_app(server)
