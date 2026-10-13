"""Conversational retrieval (LCEL replacement for ConversationalRetrievalChain)."""

from langchain_core.documents import Document
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.prompts import ChatPromptTemplate

import langchain_testing
from langchain_testing import answer_question, format_chat_history


class RecordingRetriever:
    def __init__(self, docs):
        self.docs = docs
        self.queries = []

    def invoke(self, query):
        self.queries.append(query)
        return self.docs


DOCS = [
    Document(page_content="Revenue grew 12% to $90B.", metadata={"chunk": 3, "source": "t.txt"}),
    Document(page_content="Services margin hit a record.", metadata={"chunk": 1, "source": "t.txt"}),
]


def test_first_question_skips_condense_and_returns_sources():
    llm = FakeListChatModel(responses=["Revenue grew 12%."])
    retriever = RecordingRetriever(DOCS)

    result = answer_question("How did revenue do?", retriever, [], llm=llm)

    assert result["answer"] == "Revenue grew 12%."
    assert result["source_documents"] == DOCS
    assert retriever.queries == ["How did revenue do?"]


def test_follow_up_is_condensed_before_retrieval_and_history_is_untouched():
    llm = FakeListChatModel(responses=["What was services margin?", "It hit a record."])
    retriever = RecordingRetriever(DOCS)
    history = [("How did revenue do?", "Revenue grew 12%.")]

    result = answer_question("And margins?", retriever, history, llm=llm)

    assert retriever.queries == ["What was services margin?"]
    assert result["answer"] == "It hit a record."
    assert history == [("How did revenue do?", "Revenue grew 12%.")]


def test_answer_prompt_receives_context_history_and_standalone_question():
    captured = {}
    prompt = ChatPromptTemplate.from_template("C={context}|H={chat_history}|Q={question}")

    class CapturingLLM(FakeListChatModel):
        def _call(self, messages, *args, **kwargs):
            captured.setdefault("prompts", []).append(messages[-1].content)
            return super()._call(messages, *args, **kwargs)

    llm = CapturingLLM(responses=["standalone?", "answer"])
    history = [("q1", "a1")]
    answer_question("follow up", RecordingRetriever(DOCS), history, prompt=prompt, llm=llm)

    final_prompt = captured["prompts"][-1]
    assert "Revenue grew 12% to $90B.\n\nServices margin hit a record." in final_prompt
    assert "H=Human: q1\nAssistant: a1" in final_prompt
    assert final_prompt.endswith("Q=standalone?")


def test_format_chat_history():
    assert format_chat_history([]) == ""
    assert format_chat_history([("a", "b"), ("c", "d")]) == "Human: a\nAssistant: b\nHuman: c\nAssistant: d"


def test_follow_up_questions_parse_numbered_list(monkeypatch):
    llm = FakeListChatModel(responses=["1. What drove growth?\n2. How is China?\n3. Any buybacks?"])
    monkeypatch.setattr(langchain_testing, "get_llm", lambda **_: llm)

    suggestions = langchain_testing.generate_follow_up_questions("q", "a", [{"question": "q", "answer": "a"}])

    assert suggestions == ["What drove growth?", "How is China?", "Any buybacks?"]


def test_follow_up_questions_fall_back_on_error(monkeypatch):
    def boom(**_):
        raise RuntimeError("no provider")

    monkeypatch.setattr(langchain_testing, "get_llm", boom)
    assert len(langchain_testing.generate_follow_up_questions("q", "a", [])) == 3
