// Yeh sessionStore.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * In-memory session store keyed by session UUID — ported from
 * app/state/session_store.py (SessionStore/SessionData). Replaces
 * pandas DataFrames with plain arrays of row objects (`rows`) plus a
 * `columns` list, since that's the Node-native equivalent of `df`.
 */

function newSessionData() {
  return {
    // dataset
    dataset_name: null,
    dataset_path: null,
    dataset_format: null,
    dataset_storage_mode: 'memory',
    dataset_file_size: 0,
    dataset_row_count: 0,
    dataset_column_count: 0,
    dataset_columns: [],
    dataset_snapshot: {},

    // "df" equivalents: array of row objects + column list
    rows: null,          // current working dataset (mirrors session.df)
    rowsOriginal: null,  // mirrors session.df_original
    rowsProcessed: null, // mirrors session.df_processed

    target_col: null,
    task_type: null,

    // training artifacts (populated once prediction module is ported)
    X_train: null,
    X_test: null,
    y_train: null,
    y_test: null,
    trained_models: {},
    model_results: null,
    best_model_name: null,
    best_model: null,
    cluster_results: null,
    cluster_pca_data: null,
    feature_columns: null,
    scaler: null,
    label_encoders: {},
    preprocess_meta: {},
    training_meta: {},
    cluster_meta: {},
    dashboard_builder: {},
    chat_cache: {},
    preprocessing_done: false,
    supervised_done: false,
    unsupervised_done: false,
    prediction_history: [],

    // ml-service linkage (new: replaces in-process model object with a
    // model_id returned by the FastAPI ml-service /train endpoint)
    ml_model_id: null,
  };
}

class SessionStore {
  constructor() {
    this._store = new Map();
  }

  get(sessionId) {
    if (!this._store.has(sessionId)) {
      this._store.set(sessionId, newSessionData());
    }
    return this._store.get(sessionId);
  }

  delete(sessionId) {
    this._store.delete(sessionId);
  }
}

// Global singleton, mirrors Python's module-level `store`.
const store = new SessionStore();

module.exports = { store, newSessionData };
