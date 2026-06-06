import { useState } from "react";
import { Dices } from "lucide-react";

const DICE = ["d4", "d6", "d8", "d10", "d12", "d20"];

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

export function DiceRoller() {
  const [lastRoll, setLastRoll] = useState(null);

  const handleRoll = (label) => {
    const sides = parseInt(label.slice(1), 10);
    const result = rollDie(sides);
    setLastRoll({ label, result, at: new Date().toLocaleTimeString() });
  };

  return (
    <div className="p-3 border-2 border-neon-magenta bg-black">
      <div className="flex items-center gap-2 mb-2">
        <Dices className="w-4 h-4 text-neon-magenta" />
        <span className="text-[10px] font-black uppercase tracking-widest text-starlight">
          Dice
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {DICE.map((die) => (
          <button
            key={die}
            type="button"
            onClick={() => handleRoll(die)}
            className="px-2 py-1 text-[10px] font-black uppercase border border-zinc-700 hover:border-neon-cyan hover:text-starlight"
          >
            {die}
          </button>
        ))}
      </div>
      {lastRoll && (
        <p className="mt-2 text-xs font-mono text-neon-cyan">
          {lastRoll.label}: <span className="text-starlight text-lg">{lastRoll.result}</span>
          <span className="text-zinc-600 ml-2">{lastRoll.at}</span>
        </p>
      )}
    </div>
  );
}
