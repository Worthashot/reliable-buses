// src/App.tsx
import { useState } from 'react';
import OptionSelector from './assets/OptionSelector';
import ImageViewer from './assets/ImageViewer';

function App() {
  const API_URL = import.meta.env.VITE_BUS_PROJECT_URL;
  const API_PASSWORD = import.meta.env.VITE_BUS_PROJECT_KEY;

  const [selections, setSelections] = useState({
    service: '',
    direction: '',
    stop_code: '',
  });
  const [imageUrl, setImageUrl] = useState('');
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Called when all three are chosen
  const handleAllSelected = (sel: { service: string; direction: string; stop_code: string }) => {
    setSelections(sel);
  };

  // Fetch the large image using all three parameters
  

  // Button is only enabled when all three are non-empty
  const allSelected = selections.service && selections.direction && selections.stop_code;
  
  const handleFetchImage = async () => {
    const { service, direction, stop_code } = selections;
    if (!service || !direction || !stop_code) return;
    setLoadingImage(true);
    setImageError(null);
    try {
      const params = new URLSearchParams({ service, direction, stop_code });
      const headers = {"x-api-key" : API_PASSWORD}
      const res = await fetch(`${API_URL}log/arrival_image?${params}`, {
          headers : headers
        });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      setImageUrl(URL.createObjectURL(blob));
    } catch (err: any) {
      setImageError(err.message);
    } finally {
      setLoadingImage(false);
    }
  };

 return (
    <div style={{ padding: '1rem' }}>
      <h1>London Bus Checker</h1>
      <OptionSelector onAllSelected={handleAllSelected} />
      <button onClick={handleFetchImage} disabled={!allSelected || loadingImage}>
        {loadingImage ? 'Loading...' : 'View Image'}
      </button>
      {imageError && <p style={{ color: 'red' }}>Error: {imageError}</p>}
      {imageUrl && (
        <>      
      <div>
        Red dots are recorded bus arrivals.
      </div>
      <div>
        Blue lines are timetabled buses.
      </div>
          <p>Drag to pan.</p>
          <ImageViewer imageSrc={imageUrl} />
        </>
      )}
    </div>
  );
}

export default App;