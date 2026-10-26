import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    raise RuntimeError("GROQ_API_KEY is missing from .env")

client = Groq(api_key=api_key)

response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
        {
            "role": "user",
            "content": "Explain Retrieval-Augmented Generation (RAG) in 2 sentences."
        }
    ],
    temperature=0.2,
    max_tokens=150,
)

print(response.choices[0].message.content)