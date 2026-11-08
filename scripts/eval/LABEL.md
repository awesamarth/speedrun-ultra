# Ground-truth labelling

You are creating **ground-truth labels** for an accuracy evaluation. Accuracy matters more than speed.

Input: JSONL, each line `{"id","title","location","workplace","remote","text"}` where `text` is the **full** job description.
Read the whole `text` carefully (requirements, location sections, footers, legal notices) before labelling.

Output: exactly one JSON object per input line, same order, JSONL only (no prose, no fences). Use **the same schema and field rules as PROMPT.md** (provided below), with one difference: quotes (`q`) may come from anywhere in `text` or from `location`.

Additionally add `"notes"` (string, ≤ 200 chars) on each line describing anything ambiguous you had to decide (or "" if nothing).

Be strict about `unknown`: if the text does not state it, the label is unknown, even if you could guess.
