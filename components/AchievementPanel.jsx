"use client";

import { useState } from "react";
import { REACTIONS, REACTION_LABELS, triggerReaction } from "@/lib/reactions";

export default function AchievementPanel() {
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");

  function add(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setItems((list) => [...list, { id: Date.now() + Math.random(), text: value }]);
    setText("");
    triggerReaction("celebrate");
  }

  function remove(id) {
    setItems((list) => list.filter((item) => item.id !== id));
    triggerReaction("slump");
  }

  return (
    <div className="card">
      <h3 className="card-title">Achievements</h3>
      <p className="card-sub">Log a win and your avatar celebrates. Take one away and it slumps.</p>

      <form className="achievement-form" onSubmit={add}>
        <input
          className="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Shipped the thing…"
          aria-label="New achievement"
        />
        <button type="submit" className="btn-primary">
          Add
        </button>
      </form>

      {items.length === 0 ? (
        <p className="achievement-empty">Nothing logged yet. Your avatar is waiting for good news.</p>
      ) : (
        <ul className="achievement-list">
          {items.map((item) => (
            <li key={item.id} className="achievement-item">
              <span>{item.text}</span>
              <button type="button" className="btn-small" onClick={() => remove(item.id)} aria-label={`Remove ${item.text}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="option-group">
        <span className="option-label">Tune reactions</span>
        <div className="reaction-row">
          {REACTIONS.map((name) => (
            <button key={name} type="button" className="btn-small" onClick={() => triggerReaction(name)}>
              {REACTION_LABELS[name]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
