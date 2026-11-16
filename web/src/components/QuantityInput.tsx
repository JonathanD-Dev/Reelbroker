import { useId, useState } from 'react';
import { parseQuantity } from '../lib/projections';

interface QuantityInputProps {
  value: number;
  onChange: (q: number) => void;
}

export function QuantityInput({ value, onChange }: QuantityInputProps) {
  const id = useId();
  const [raw, setRaw] = useState(String(value));

  return (
    <div className="quantity">
      <label htmlFor={id}>Si j’achetais</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(parseQuantity(e.target.value));
        }}
        onBlur={() => setRaw(String(value))}
      />
    </div>
  );
}
