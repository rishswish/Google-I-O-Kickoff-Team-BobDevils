"""
RocketRide connection check.
Run: python check.py
"""
import asyncio
from rocketride import RocketRideClient
from rocketride.schema import Question

async def main():
    print("Connecting to RocketRide engine...")
    async with RocketRideClient() as client:
        print("Connected!")

        # Start analysis pipeline
        r = await client.use(filepath="wc_analysis.pipe", use_existing=True)
        token = r["token"]
        print(f"Analysis pipeline token: {token}")

        # Send a test question
        q = Question()
        q.addQuestion("Say 'RocketRide + GMI Cloud working!' in exactly those words.")
        resp = await client.chat(token=token, question=q)

        answers = resp.get("answers", [])
        if answers:
            print(f"\nGMI Cloud response via RocketRide:\n  {answers[0]}")
            print("\nAll systems go!")
        else:
            print(f"\nUnexpected response: {resp}")

asyncio.run(main())
