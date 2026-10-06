import React from 'react';

// Sample list of power house names – replace with actual data if needed
const powerHouses = [
  'Tarbela Dam',
  'Kashmir Hydro',
  'Dargai Plant',
  'Swat Hydro',
  'Ghazi Ghat',
  'Kara Dam',
  'Miran‑Bach',
  'Kurram Hydro',
];

export default function PowerHousesGrid() {
  return (
    <div className="mt-8">
      <h3 className="text-sm font-bold text-[#0B2545] mb-3 uppercase tracking-wider">Power Houses</h3>
      <div className="grid grid-cols-2 gap-2">
        {powerHouses.map((name) => (
          <div
            key={name}
            className="px-3 py-2 card !p-2 rounded-xl text-xs font-semibold text-[#0B2545] hover:border-[#2F9E9A] transition-colors"
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}
