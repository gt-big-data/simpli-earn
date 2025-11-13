# api_chatbot.py
from fastapi import FastAPI
from pydantic import BaseModel
from transcript_retrieval import get_video_transcript, save_transcript_as_txt
from langchain_testing import initialize_retrieval, get_chat_response, generate_follow_up_questions
from langchain.memory import ConversationBufferMemory
import os
from datetime import datetime
from langchain.chains import ConversationalRetrievalChain
from langchain.chat_models import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
from fastapi import Query, Body
from typing import Optional


from fastapi.middleware.cors import CORSMiddleware

last_used_id = None  # NEW: track last dashboard id


app = FastAPI()

# Add this block to enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for dev; tighten in prod
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Persistent objects
memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
retriever = None
qa_chain = None  # ✅ NEW
summary_chain = None  # ✅ For generating one-off summaries

# Static transcripts for library
STATIC_TRANSCRIPTS = {
    "1": "transcripts/apple_seeking_alpha.txt",
    "2": "transcripts/cvs_seeking_alpha.txt",
    "3": "transcripts/alphabet_seeking_alpha.txt",
    "4": "transcripts/shell_seeking_alpha.txt",
    "5": "transcripts/tesla_seeking_alpha.txt",
    "6": "transcripts/walmart_seeking_alpha.txt"
}

UPLOADS_DIR = "uploads"
chat_history = []

class ChatRequest(BaseModel):
    message: str
    id: Optional[str] = None
    video_url: Optional[str] = None

def save_transcript_in_uploads(video_url, transcript_text):
    """Save transcript to the uploads folder with a timestamped filename."""
    today = datetime.now().strftime("%Y-%m-%d")
    upload_dir = os.path.join(UPLOADS_DIR, today)
    os.makedirs(upload_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%H-%M-%S")
    transcript_filename = f"youtube_transcript_{timestamp}.txt"
    file_path = os.path.join(upload_dir, transcript_filename)
    save_transcript_as_txt(transcript_text, file_path)
    return file_path

@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    global retriever, qa_chain, memory, last_used_id

    # Always clear memory and retriever if either source (id or video_url) changed
    source_changed = False

    if req.video_url:
        # Switching from preloaded to YouTube or new video
        if last_used_id != f"YT::{req.video_url}":
            source_changed = True
            last_used_id = f"YT::{req.video_url}"

    elif req.id:
        # Switching from YouTube to preloaded or to different preloaded ID
        if last_used_id != req.id:
            source_changed = True
            last_used_id = req.id

    if source_changed:
        memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
        retriever = None
        qa_chain = None

    # Load transcript depending on source
    if req.video_url and not retriever:
        transcript = get_video_transcript(req.video_url)
        if "Error:" in transcript:
            return {"response": transcript}
        transcript_path = save_transcript_in_uploads(req.video_url, transcript)
        retriever, _ = initialize_retrieval(transcript_path)

    elif req.id and not retriever:
        if req.id in STATIC_TRANSCRIPTS:
            transcript_path = STATIC_TRANSCRIPTS[req.id]
            retriever, _ = initialize_retrieval(transcript_path)
        else:
            return {"response": "❌ Unknown dashboard ID or missing transcript."}

    if not retriever:
        return {"response": "❌ No transcript loaded. Provide video_url or valid id."}

    if qa_chain is None:
        prompt_template = ChatPromptTemplate.from_template(
            """
            You are a financial assistant providing insights from this transcript of an earnings call you currently have.
            You are to give objective answers at all times.
            This document is the earnings call of a given company, and it will have typical information such as the name of the company, the participants at the start of the document.
            Use the provided context and chat history to answer the user's questions.
            If the question is irrelevant to the document, politely state so.
            Assume the user is not a financial expert.
            If the user states anything unrelated to the earnings call (need not be a question), please do not answer it and let them know that you are only allowed to answer questions and provide information of the given earnings call.
            Do not start your response by citing the transcript of the call.
            

            Context: {context}
            Chat History: {chat_history}
            User: {question}
            Assistant:
            """
        )
        qa_chain = ConversationalRetrievalChain.from_llm(
            llm=ChatOpenAI(model_name="gpt-4o", openai_api_key=os.getenv("OPENAI_API_KEY")),
            retriever=retriever,
            memory=memory,
            combine_docs_chain_kwargs={"prompt": prompt_template}
        )

    response = qa_chain.invoke({"question": req.message})
    chat_history.append({"question": req.message, "answer": response["answer"]})

    # Generate follow-up question suggestions
    suggestions = generate_follow_up_questions(
        user_question=req.message,
        bot_answer=response["answer"],
        chat_history=chat_history,
        retriever=retriever
    )

    return {"response": response["answer"], "suggestions": suggestions}



@app.get("/summary")
def generate_summary(id: str = Query("1")):
    global summary_chain

    if id not in STATIC_TRANSCRIPTS:
        return {"summary": "❌ Unknown dashboard ID or missing transcript."}

    transcript_path = STATIC_TRANSCRIPTS[id]
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript_text = f.read()
    except Exception as e:
        return {"summary": f"❌ Failed to load transcript: {str(e)}"}

    if summary_chain is None:
        prompt = PromptTemplate(
            input_variables=["transcript"],
            template="""
You are a financial analyst assistant. Read the following earnings call transcript and generate a detailed yet concise summary highlighting the key financial results, executive commentary, and any forward-looking statements. Bold any key terms in the summary. Start the summary with a very brief (max one paragraph) overall summary of the call, then go into a mode detailed summary.

Transcript:
{transcript}

Summary:
"""
        )
        summary_chain = LLMChain(
            llm=ChatOpenAI(model_name="gpt-4o", openai_api_key=os.getenv("OPENAI_API_KEY")),
            prompt=prompt
        )

    summary = summary_chain.run(transcript=transcript_text)
    return {"summary": summary}


@app.post("/summary")
def generate_summary_from_youtube(data: dict = Body(...)):
    video_url = data.get("video_url")
    if not video_url:
        return {"summary": "❌ No video URL provided."}

    transcript = get_video_transcript(video_url)
    if "Error:" in transcript:
        return {"summary": transcript}

    transcript_path = save_transcript_in_uploads(video_url, transcript)

    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript_text = f.read()
    except Exception as e:
        return {"summary": f"❌ Failed to read transcript: {str(e)}"}

    global summary_chain
    if summary_chain is None:
        prompt = PromptTemplate(
            input_variables=["transcript"],
            template="""
You are a financial analyst assistant. Read the following earnings call transcript and generate a summary highlighting the key financial results, executive commentary, and any forward-looking statements.
Don't make it too long and do not use complicated financial terminology, assume the user has little knowledge of finance. 
If you do want to use complicated terminology/jargon please do define it as well/explain it so it is clear for the user.

Transcript:
{transcript}

Summary:
"""
        )
        summary_chain = LLMChain(
            llm=ChatOpenAI(model_name="gpt-4o", openai_api_key=os.getenv("OPENAI_API_KEY")),
            prompt=prompt
        )

    summary = summary_chain.run(transcript=transcript_text)
    return {"summary": summary}