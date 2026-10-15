import os

from fastapi import APIRouter, Depends
from openai import OpenAI

from auth import current_user

MODEL = "openai/gpt-oss-120b"

router = APIRouter(prefix="/api")


def get_client() -> OpenAI:
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )


def ask(prompt: str) -> str:
    response = get_client().chat.completions.create(
        model=MODEL, messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content


@router.post("/ai/test")
def test_ai(username: str = Depends(current_user)):
    return {"reply": ask("What is 2+2?")}
