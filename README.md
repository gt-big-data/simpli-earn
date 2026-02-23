# Simpli-Earn

## Git Practices

- Make a new branch for any feature addition formatted "initials/subteam/feature"
- Do not commit directly to main (even for small changes) so we can make sure the main branch remains error free. You should instead make a new branch off main, add the feature you are working on, and then open a pull request (and send it on Slack) so someone can review it
  - Sidenote: when you do this, you should git fetch & merge main into your local branch to make sure there aren't a lot of merge conflicts later on

Feel free to message Gauri/Ritwij on Slack or text if you have any questions!

## General Info

As of April 16, 2025:

We demoed this project on April 15, 2025, at the BDBI Demo Day. It was a success overall, as we were able to showcase most of the intended features, such as a working stock chart and sentiment analysis on a preset library of transcripts, as well as the chatbot working on both the transcripts in the library and most YouTube links.

Improvements and future plans will be announced soon -- stay tuned!

**Local setup (frontend + backend + YouTube pipeline):** See [LOCAL_SETUP.md](LOCAL_SETUP.md) for complete instructions.

Quick start:
- Run `npm install` in the `frontend` folder
- Install Python deps: `pip install -r RAG/requirements.txt` and `pip install -r sentiment/requirements.txt`
- Run RAG API (port 8000), Sentiment API (port 8001), and `npm run dev` in frontend

## This file was last updated on April 16, 2025
