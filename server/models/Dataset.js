const mongoose = require('mongoose');

const datasetSchema = new mongoose.Schema(
  {
    session_id: {
      type: String,
      required: true,
      index: true,
    },

    filename: String,
    data: Array,
    meta: Object,
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    collection: 'datasets',
  }
);

const Dataset =
  mongoose.models.Dataset ||
  mongoose.model('Dataset', datasetSchema);

module.exports = {
  datasetSchema,
  Dataset,
};