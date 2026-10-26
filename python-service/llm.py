import os

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    raise RuntimeError("GROQ_API_KEY is missing from .env")

client = Groq(api_key=api_key)

MODEL_NAME = "openai/gpt-oss-120b"


def generate_answer(prompt: str) -> str:
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
        temperature=0.2,
        max_tokens=500,
    )

    answer = response.choices[0].message.content

    if not answer:
        raise RuntimeError("Groq returned an empty response")

    return answer.strip()
