import asyncio
import edge_tts

async def main():
    voices = await edge_tts.list_voices()
    for v in voices:
        if "en-US" in v["ShortName"] and v["Gender"] == "Female":
            print(f"{v['ShortName']} - {v['FriendlyName']}")

asyncio.run(main())
