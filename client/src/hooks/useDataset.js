// Yeh useDataset.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
import { useEffect, useMemo, useState } from 'react';
import { buildDatasetProfile } from '../utils/dataset.js';

const STORAGE_KEY = 'datalytics_dataset';
const STORAGE_META_KEY = 'datalytics_dataset_meta';

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function useDataset() {
  const [dataset, setDataset] = useState(null);

  useEffect(() => {
    const stored = safeParse(localStorage.getItem(STORAGE_KEY));
    const meta = safeParse(localStorage.getItem(STORAGE_META_KEY));
    if (stored?.rows?.length) {
      setDataset({ ...stored, meta });
      window.datasetJSON = stored.rows.slice(0, 1000);
    }
  }, []);

  const profile = useMemo(() => (dataset ? buildDatasetProfile(dataset) : null), [dataset]);

  function persistDataset(nextDataset) {
    if (!nextDataset) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_META_KEY);
      window.datasetJSON = [];
      return;
    }
    const sampleRows = Array.isArray(nextDataset.rows) ? nextDataset.rows.slice(0, 5000) : [];
    const shouldStoreSampleOnly = Boolean(nextDataset?.meta?.backend_managed) || String(nextDataset?.meta?.storage_mode || '').toLowerCase() === 'disk';
    const payload = {
      name: nextDataset.name,
      rows: shouldStoreSampleOnly ? sampleRows.slice(0, 1000) : sampleRows,
      columns: nextDataset.columns,
    };
    const json = JSON.stringify(payload);
    if (json.length < 4_000_000) {
      localStorage.setItem(STORAGE_KEY, json);
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(nextDataset.meta || {}));
    } else {
      const sample = {
        name: nextDataset.name,
        rows: nextDataset.rows.slice(0, 1000),
        columns: nextDataset.columns,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify({ ...nextDataset.meta, truncated: true }));
    }
    window.datasetJSON = sampleRows.slice(0, 1000);
  }

  function updateDataset(nextDataset) {
    setDataset(nextDataset);
    persistDataset(nextDataset);
  }

  function clearDataset() {
    setDataset(null);
    persistDataset(null);
  }

  return {
    dataset,
    profile,
    setDataset: updateDataset,
    clearDataset,
  };
}
