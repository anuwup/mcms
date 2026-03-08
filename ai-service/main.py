import os
import re
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="MCMS AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

openai_client = None
if OPENAI_API_KEY:
    try:
        from openai import OpenAI
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
    except ImportError:
        pass


class TranscriptSegment(BaseModel):
    text: str
    speaker: str = "Unknown"
    agendaItemId: str | None = None


class AgendaItem(BaseModel):
    id: str
    title: str


class SummarizeRequest(BaseModel):
    segments: list[TranscriptSegment]
    agenda_items: list[AgendaItem] = []


class ExtractActionsRequest(BaseModel):
    text: str


class SentimentRequest(BaseModel):
    text: str


@app.post("/summarize")
async def summarize(req: SummarizeRequest):
    segments_by_agenda: dict[str, list[str]] = {}
    for seg in req.segments:
        key = seg.agendaItemId or "_unlinked"
        segments_by_agenda.setdefault(key, []).append(f"{seg.speaker}: {seg.text}")

    if openai_client and req.agenda_items:
        try:
            agenda_info = "\n".join(
                f"- {item.id}: {item.title}" for item in req.agenda_items
            )
            transcript_text = "\n".join(
                f"{seg.speaker}: {seg.text}" for seg in req.segments
            )
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a meeting summarizer. Given agenda items and transcript, "
                            "produce a JSON object mapping each agenda item ID to a concise "
                            "1-2 sentence summary of what was discussed. Use the exact agenda IDs as keys."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Agenda items:\n{agenda_info}\n\nTranscript:\n{transcript_text}",
                    },
                ],
                response_format={"type": "json_object"},
                max_tokens=1000,
            )
            import json
            summaries = json.loads(response.choices[0].message.content)
            return {"summaries": summaries}
        except Exception as e:
            print(f"OpenAI summarize error: {e}")

    summaries = {}
    for item in req.agenda_items:
        texts = segments_by_agenda.get(item.id, [])
        if texts:
            speakers = set()
            for t in texts:
                sp = t.split(":")[0].strip()
                if sp:
                    speakers.add(sp)
            summaries[item.id] = (
                f"{len(texts)} segment(s) discussed. "
                f"Key speakers: {', '.join(speakers) if speakers else 'Unknown'}."
            )
        else:
            summaries[item.id] = "No discussion recorded for this item."

    unlinked = segments_by_agenda.get("_unlinked", [])
    if unlinked:
        summaries["_unlinked"] = f"{len(unlinked)} unlinked segment(s)."

    return {"summaries": summaries}


@app.post("/extract-actions")
async def extract_actions(req: ExtractActionsRequest):
    if openai_client:
        try:
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an action item extractor. Given meeting transcript text, "
                            "extract action items as a JSON object with key 'actions' containing "
                            "an array of objects with fields: title, assignee (name or null), "
                            "deadline (ISO date or null), category (Technical/Administrative/"
                            "Decision/Follow-up), confidence (0-1 float)."
                        ),
                    },
                    {"role": "user", "content": req.text},
                ],
                response_format={"type": "json_object"},
                max_tokens=1000,
            )
            import json
            data = json.loads(response.choices[0].message.content)
            return {"actions": data.get("actions", [])}
        except Exception as e:
            print(f"OpenAI extract-actions error: {e}")

    actions = []
    action_patterns = [
        r"(?:need to|should|will|must|has to|going to)\s+(.+?)(?:\.|$)",
        r"(?:action item|todo|task)[:\s]+(.+?)(?:\.|$)",
    ]
    lines = req.text.split("\n")
    for line in lines:
        for pattern in action_patterns:
            matches = re.findall(pattern, line, re.IGNORECASE)
            for match in matches:
                title = match.strip()
                if len(title) > 10 and len(title) < 200:
                    speaker_match = re.match(r"^(\w[\w\s.]+?):\s*", line)
                    assignee = speaker_match.group(1).strip() if speaker_match else None
                    actions.append(
                        {
                            "title": title[:150],
                            "assignee": assignee,
                            "deadline": None,
                            "category": "Technical",
                            "confidence": 0.5,
                        }
                    )

    seen = set()
    unique_actions = []
    for a in actions:
        key = a["title"].lower()
        if key not in seen:
            seen.add(key)
            unique_actions.append(a)

    return {"actions": unique_actions[:10]}


@app.post("/sentiment")
async def sentiment(req: SentimentRequest):
    if openai_client:
        try:
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Classify the sentiment of the following text as exactly one of: "
                            "positive, neutral, negative. Return JSON with key 'score'."
                        ),
                    },
                    {"role": "user", "content": req.text[:500]},
                ],
                response_format={"type": "json_object"},
                max_tokens=50,
            )
            import json
            data = json.loads(response.choices[0].message.content)
            return {"score": data.get("score", "neutral")}
        except Exception as e:
            print(f"OpenAI sentiment error: {e}")

    text_lower = req.text.lower()
    positive_words = {"great", "good", "excellent", "happy", "thanks", "agree", "perfect", "wonderful", "love"}
    negative_words = {"bad", "wrong", "fail", "issue", "problem", "concern", "disagree", "terrible", "hate"}

    pos_count = sum(1 for w in positive_words if w in text_lower)
    neg_count = sum(1 for w in negative_words if w in text_lower)

    if pos_count > neg_count:
        return {"score": "positive"}
    elif neg_count > pos_count:
        return {"score": "negative"}
    return {"score": "neutral"}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "openai_available": openai_client is not None,
    }
