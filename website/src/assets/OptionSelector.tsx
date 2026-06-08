import { useState, useEffect } from 'react';

interface Props {
  onAllSelected: (selections: { service: string; direction: string; stop_code: string }) => void;
}

interface BusStop {
  stop_name : string;
  stop_code : string;
}

interface Journey {
  service : string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function OptionSelector({ onAllSelected }: Props) {
  const API_URL = import.meta.env.VITE_BUS_PROJECT_URL;
  const API_PASSWORD = import.meta.env.VITE_BUS_PROJECT_KEY;

  // State for the first box
  const [box1Options, setBox1Options] = useState<Journey[]>([]);
  const [selectedBox1, setSelectedBox1] = useState('');
  const [loadingBox1, setLoadingBox1] = useState(true);
  const [errorBox1, setErrorBox1] = useState('');

  const box2Options = ['outbound', 'inbound'];
  const [selectedBox2, setSelectedBox2] = useState('');

  // State for the third box
  const [box3Options, setBox3Options] = useState<BusStop[]>([]);
  const [selectedBox3, setSelectedBox3] = useState('');
  const [loadingBox3, setLoadingBox3] = useState(false);
  const [errorBox3, setErrorBox3] = useState('');

  useEffect(() => {
    const fetchBox1Options = async () => {
      try {
        setLoadingBox1(true);
        const headers = {"x-api-key" : API_PASSWORD}
        const response = await fetch(`${API_URL}journeys/services`, {
          headers : headers
        });
        if (!response.ok) throw new Error('Failed to fetch box1 options');
        const data = await response.json();
        setBox1Options(data);
        setErrorBox1('');
      } catch (err) {
        setErrorBox1(getErrorMessage(err));
      } finally {
        setLoadingBox1(false);
      }
    };
    fetchBox1Options();
  }, []);

  useEffect(() => {
    if (!selectedBox1 || !selectedBox2) {
      setBox3Options([]);
      setSelectedBox3('');
      return;
    }

    const fetchBox3Options = async () => {
      setLoadingBox3(true);
      setErrorBox3('');
      setBox3Options([]);
      setSelectedBox3('');

      try {
        const url = new URL(`${API_URL}stop/name_from_service`);
        url.searchParams.append('service', selectedBox1);
        url.searchParams.append('direction', selectedBox2);
        const headers = {"x-api-key" : API_PASSWORD}
        const response = await fetch(url, {
          headers : headers
        });
        if (!response.ok) throw new Error('Failed to fetch box3 options');
        const data = await response.json(); 
        setBox3Options(data);
      } catch (err) {
        setErrorBox3(getErrorMessage(err));
      } finally {
        setLoadingBox3(false);
      }
    };

    fetchBox3Options();
  }, [selectedBox1, selectedBox2]);

  // Inform parent when selection changes
  useEffect(() => {
    if (selectedBox1 && selectedBox2 && selectedBox3) {
      onAllSelected({ service: selectedBox1, direction: selectedBox2, stop_code: selectedBox3 });
    }
  }, [selectedBox1, selectedBox2, selectedBox3, onAllSelected]);

  return (
    <div>
      {/* Box 1*/}
      <div>
        <label>Service: </label>
        {loadingBox1 && <span>Loading options...</span>}
        {errorBox1 && <span style={{ color: 'red' }}>Error: {errorBox1}</span>}
        {!loadingBox1 && !errorBox1 && (
          <select
            value={selectedBox1}
            onChange={(e) => setSelectedBox1(e.target.value)}
          >
            <option value="">-- Select --</option>
            {box1Options.map((opt, idx) => (
              <option key={idx} value={opt.service}>
                {opt.service}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Box 2*/}
      <div>
        <label>Direction: </label>
        <select
          value={selectedBox2}
          onChange={(e) => setSelectedBox2(e.target.value)}
        >
          <option value="">-- Select --</option>
          {box2Options.map((opt, idx) => (
            <option key={idx} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {/* Box 3 */}
      {(selectedBox1 && selectedBox2) && (
        <div>
          <label>Bus Stop: </label>
          {loadingBox3 && <span>Loading options...</span>}
          {errorBox3 && <span style={{ color: 'red' }}>Error: {errorBox3}</span>}
          {!loadingBox3 && !errorBox3 && (
            <select
              value={selectedBox3}
              onChange={(e) => setSelectedBox3(e.target.value)}
              disabled={box3Options.length === 0}
            >
              <option value="">-- Select --</option>
                {box3Options.map((item, idx) => (
                  <option key={idx} value={item.stop_code}>
                    {item.stop_name}
                  </option>
                ))}
            </select>
          )}
        </div>
      )}

    </div>
  );
}

export default OptionSelector;