import os
import hashlib
from dotenv import load_dotenv
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import FAISS
from langchain.embeddings.openai import OpenAIEmbeddings
from langchain.schema import Document
from langchain.chat_models import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from langchain.prompts import ChatPromptTemplate
import time

# Load environment variables
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY not found in .env file")

# Initialize OpenAI embeddings
embeddings = OpenAIEmbeddings(model="text-embedding-ada-002", openai_api_key=OPENAI_API_KEY)

def generate_content_hash(file_content: str) -> str:
    """Generates a unique SHA-256 hash from the file content."""
    return hashlib.sha256(file_content.encode('utf-8')).hexdigest()

def initialize_retrieval(file_path):
    """Creates a unique FAISS index based on file content hash."""
    
    with open(file_path, "r", encoding="utf-8") as f:
        transcript_text = f.read()

    # Generate hash from content
    content_hash = generate_content_hash(transcript_text)
    faiss_index_path = f"faiss_indices/faiss_index_{content_hash}"

    # Check if FAISS index already exists
    if os.path.exists(faiss_index_path):
        print(f"Loading FAISS index for content hash {content_hash} from disk...")
        vectorstore = FAISS.load_local(faiss_index_path, embeddings, allow_dangerous_deserialization=True)
    else:
        print(f"Creating new FAISS index for content hash {content_hash}...")
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
        chunks = text_splitter.split_text(transcript_text)
        documents = [Document(page_content=chunk) for chunk in chunks]
        vectorstore = FAISS.from_documents(documents, embeddings)
        vectorstore.save_local(faiss_index_path)

    retriever = vectorstore.as_retriever()
    return retriever, content_hash  # Return hash for display/reference

def summarize_document(file_path):
    """Streams a summary of the document using ChatOpenAI."""
    with open(file_path, "r", encoding="utf-8") as f:
        transcript_text = f.read()

    # Prompt template for summarization
    summary_prompt = PromptTemplate(
        input_variables=["document"],
        template="Summarize the following document in a concise and informative manner:\n\n{document}"
    )

    # Initialize the LLM for streaming
    llm = ChatOpenAI(model_name="gpt-4o", openai_api_key=OPENAI_API_KEY, streaming=True)

    # Create a chain for summarization
    chain = LLMChain(llm=llm, prompt=summary_prompt)

    # Stream the summary output
    for chunk in chain.stream({"document": transcript_text[:3000]}):  # Limit text for summarization
        time.sleep(0.05)
        yield chunk["text"]

def get_chat_response(user_input, retriever, memory):
    """Generates responses using conversational retrieval with memory."""
    
    prompt_template = ChatPromptTemplate.from_template(
            """
            You are a financial assistant providing insights from this document you currently have.
            You are to give objective answers at all times.
            This document is the earnings call of a given company, and it will have typical information such as the name of the company, the participants at the start of the document.
            Use the provided context and chat history to answer the user's questions.
            If the question is irrelevant to the document, politely state so.

            Context: {context}
            Chat History: {chat_history}
            User: {question}
            Assistant:
            """
        )

    qa_chain = ConversationalRetrievalChain.from_llm(
        llm=ChatOpenAI(model_name="gpt-4o", openai_api_key=OPENAI_API_KEY),
        retriever=retriever,
        memory=memory,
        combine_docs_chain_kwargs={"prompt": prompt_template}
    )

    response = qa_chain.invoke({"question": user_input})
    return response["answer"]

def generate_follow_up_questions(user_question: str, bot_answer: str, chat_history: list, retriever=None):
    """
    Generates 3 contextual follow-up questions based on the conversation.

    Args:
        user_question: The question the user just asked
        bot_answer: The answer the bot just provided
        chat_history: List of previous Q&A pairs
        retriever: Optional retriever for context (not used currently, but kept for future)

    Returns:
        List of 3 follow-up question strings, or empty list on error
    """

    # Fallback suggestions if LLM fails
    FALLBACK_SUGGESTIONS = [
        "What were the key financial highlights?",
        "What risks or challenges were mentioned?",
        "What is the outlook for next quarter?"
    ]

    try:
        # Build chat history string for context
        history_str = ""
        if chat_history:
            # Only use last 5 exchanges to keep context manageable
            recent_history = chat_history[-5:]
            history_str = "\n".join([f"Q: {item['question']}\nA: {item['answer'][:100]}..." for item in recent_history])

        # Create prompt for generating follow-up questions
        suggestion_prompt = PromptTemplate(
            input_variables=["user_question", "bot_answer", "chat_history"],
            template="""You are a helpful assistant for analyzing earnings calls. Based on the conversation below, suggest 3 specific follow-up questions that would help the user gain deeper insights into the earnings call.

Previous conversation (recent):
{chat_history}

Latest exchange:
User asked: {user_question}
You answered: {bot_answer}

Generate exactly 3 follow-up questions that are:
1. Directly related to the earnings call content
2. Specific and actionable (not generic)
3. Help explore different aspects (financial metrics, strategy, risks, guidance, etc.)
4. Under 12 words each
5. Not repeating questions already asked

Format your response as a simple numbered list:
1. [question 1]
2. [question 2]
3. [question 3]

Do not include any other text, just the numbered questions."""
        )

        # Initialize LLM
        llm = ChatOpenAI(
            model_name="gpt-4o",
            openai_api_key=OPENAI_API_KEY,
            temperature=0.7  # Slightly creative but still focused
        )

        # Create chain
        chain = LLMChain(llm=llm, prompt=suggestion_prompt)

        # Generate suggestions
        result = chain.run(
            user_question=user_question,
            bot_answer=bot_answer[:500],  # Limit to avoid token overflow
            chat_history=history_str if history_str else "No previous conversation"
        )

        # Parse the response
        suggestions = []
        for line in result.strip().split('\n'):
            line = line.strip()
            # Remove numbering (1., 2., 3., etc.)
            if line and (line[0].isdigit() or line.startswith('-')):
                # Extract question after number and punctuation
                question = line.split('.', 1)[-1].strip() if '.' in line else line.strip('- ')
                if question:
                    suggestions.append(question)

        # Ensure we have exactly 3 suggestions
        if len(suggestions) >= 3:
            return suggestions[:3]
        elif len(suggestions) > 0:
            # If we got some but not 3, pad with fallbacks
            return suggestions + FALLBACK_SUGGESTIONS[:3-len(suggestions)]
        else:
            # If parsing failed, return fallbacks
            return FALLBACK_SUGGESTIONS

    except Exception as e:
        print(f"Error generating follow-up questions: {e}")
        return FALLBACK_SUGGESTIONS
