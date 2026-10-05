# README for the RAG API

# Update: April 16, 2025 by Neil Samant

The RAG code has now been turned into an API, and it needs to be run with the frontend (most typically through a second command prompt/terminal).

You still need to install the libraries in requirements.txt as given below, and get the env file with the OpenAI API key. Those instructions are still the same and can be found below.

However - you will also need to pip install `fastapi` and `uvicorn` as those are required to run the API.

Once this is done - open a new terminal/command prompt, navigate to the RAG folder, and type the following:

`uvicorn api_chatbot:app --reload` - assuming you have the `api_chatbot.py` file (which you should if you cloned the latest version of this repository).

If you get some installation/library errors, you probably forgot to install something, but if you keep getting them then please contact me (Neil).

You can still run the streamlit version if you just want to test the backend! Those instructions are below and (should) still work.

# Old Code (Feb-March 2025) - but the requirements.txt and env file instructions are still relevant.

This is the code I (Neil) have so far and was demoed at the subteam meeting on Feb 26, 2025.

This file will detail the instructions to run my code on your end.

## Pre-run steps

This is for Windows, but Mac should be similar if not the same?

1. Clone this repository (obviously the whole simpli-earn repository)
2. Run pip install -r requirements.txt in your RAG folder directory of this repository
3. Make a .env file (it should literally be titled ".env") and add the API key (which is in the Drive, you can actually download that env [here](https://drive.google.com/drive/folders/1PewkV3oMKkaI7gKmTIMVl4BkM2Ne8tSq) - must be signed in to SimpliEarn Google account though. That file should have the API key)
  - Please check the billing (how much money we have left) [here](https://platform.openai.com/settings/organization/billing/overview) - this shouldn't drain that fast but you never know, try not to abuse it. Again you must be signed into the OpenAI billing platform with the SimpliEarn Google account.

## How to actually run and use the project

1. Type "streamlit run main.py" in your terminal
  - If you get any pip errors or package not found errors please let me know, the packages I put should be the same across MacOS and Windows but I'm not 100% sure, as I did face problems with someone when working on a recent project with them
2. The UI is very intuitive to use. Just upload a transcript file - you can do this by copying a transcript from Seeking Alpha into a blank txt and uploading that
3. Experiment and try to break it, any changes to the prompt or any major code changes should ideally be discussed before directly committing

