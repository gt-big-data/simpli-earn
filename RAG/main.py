import streamlit as st
from langchain_testing import initialize_retrieval, get_chat_response, summarize_document
from transcript_retrieval import get_video_transcript, save_transcript_as_txt
import os
from datetime import datetime
import time

# User & AI icons
user_icon = "https://cdn-icons-png.flaticon.com/512/1154/1154448.png"
ai_icon = "https://cdn-icons-png.flaticon.com/512/4712/4712038.png"

# App title
st.title('📊 SimpliEarn RAG Earnings Call Chatbot')

st.subheader("Upload a .txt file or enter a YouTube video URL to ask questions!")

def save_uploaded_file(uploaded_file):
    """Saves the uploaded file with timestamp in a date-based directory."""
    today = datetime.now().strftime("%Y-%m-%d")
    upload_dir = os.path.join("uploads", today)
    os.makedirs(upload_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%H-%M-%S")
    original_name = os.path.splitext(uploaded_file.name)[0]
    extension = os.path.splitext(uploaded_file.name)[1]

    new_filename = f"{original_name}_{timestamp}{extension}"
    file_path = os.path.join(upload_dir, new_filename)

    with open(file_path, "wb") as f:
        f.write(uploaded_file.getbuffer())

    return file_path, new_filename, upload_dir

# **Option 1: File Upload**
uploaded_file = st.file_uploader("📂 Choose a .txt file", type=["txt"])

# **Option 2: YouTube URL Input**
video_url = st.text_input("🎥 Enter a YouTube video URL")

if st.button("Fetch Transcript"):
    if video_url:
        with st.spinner("Fetching transcript..."):
            transcript_text = get_video_transcript(video_url)
            if "Error:" not in transcript_text:
                today = datetime.now().strftime("%Y-%m-%d")
                upload_dir = os.path.join("uploads", today)
                os.makedirs(upload_dir, exist_ok=True)
                
                timestamp = datetime.now().strftime("%H-%M-%S")
                new_filename = f"youtube_transcript_{timestamp}.txt"
                file_path = os.path.join(upload_dir, new_filename)
                
                save_transcript_as_txt(transcript_text, file_path)
                
                st.success(f"Transcript saved as `{new_filename}` in `{upload_dir}`")
                st.session_state.uploaded_file_path = file_path
                st.session_state.uploaded_file_name = new_filename
            else:
                st.error("Failed to fetch transcript. Try another video.")
                

# Process the uploaded file or fetched transcript
if uploaded_file or "uploaded_file_path" in st.session_state:
    if uploaded_file:
        file_path, new_filename, upload_dir = save_uploaded_file(uploaded_file)
        st.session_state.uploaded_file_path = file_path
        st.session_state.uploaded_file_name = new_filename

    file_path = st.session_state.uploaded_file_path

    # Initialize retriever and memory only if not already set
    if "retriever" not in st.session_state or "memory" not in st.session_state:
        retriever, _ = initialize_retrieval(file_path)
        st.session_state.retriever = retriever
        st.session_state.memory = []
        st.session_state.chat_history = []

    # Generate summary
    if "summary" not in st.session_state:
        st.success("⏳ Generating document summary...")
        summary_placeholder = st.empty()
        summary_placeholder.subheader("📄 Document Summary:")

        summary_text = ""
        for chunk in summarize_document(file_path):
            summary_text += chunk
            summary_placeholder.markdown(f"```\n{summary_text}\n```")
            time.sleep(0.05)

        summary_placeholder.empty()
        st.session_state.summary = summary_text
        st.success("✅ Document summary completed! Start chatting below.")

# Show stored summary if it exists
if "summary" in st.session_state:
    st.subheader("📄 Document Summary:")
    st.write(st.session_state.summary)

# Ensure chat history is stored
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

st.write("### 💬 Chat History:")
for entry in st.session_state.chat_history:
    st.markdown(
        f'''<img src="{user_icon}" width="24"/> <strong>You:</strong> {entry['question']}''',
        unsafe_allow_html=True
    )
    st.markdown(
        f'''<img src="{ai_icon}" width="24"/> <strong>AI:</strong> {entry['answer']}''',
        unsafe_allow_html=True
    )
    st.write("---")

# User Input for Chatbot
user_input = st.chat_input("💬 Ask a question about the document...")

if user_input and "retriever" in st.session_state and "memory" in st.session_state:
    response = get_chat_response(user_input, st.session_state.retriever, st.session_state.memory)
    
    # Append new entry to chat history
    st.session_state.chat_history.append({"question": user_input, "answer": response})

    # Display the conversation
    st.markdown(
        f'''<img src="{user_icon}" width="24"/> <strong>You:</strong> {user_input}''',
        unsafe_allow_html=True
    )
    st.markdown(
        f'''<img src="{ai_icon}" width="24"/> <strong>AI:</strong> {response}''',
        unsafe_allow_html=True
    )
    st.write("---")
