/**
 * In-memory store for active GrizzlySMS activations.
 * Keyed by activationId (string).
 * Stores: { userId, username, phoneNumber, activationCost }
 * Entries are removed once the activation is completed, cancelled, or timed out.
 */
const store = new Map();

module.exports = {
  set(activationId, data) {
    store.set(String(activationId), data);
  },
  get(activationId) {
    return store.get(String(activationId));
  },
  delete(activationId) {
    store.delete(String(activationId));
  },
};
