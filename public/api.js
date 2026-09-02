async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload; // every mutation answers with the whole board
}

export const api = {
  board: () => request('/board'),
  createTask: (fields) => request('/tasks', { method: 'POST', body: JSON.stringify(fields) }),
  updateTask: (id, fields) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  moveTask: (id, move) => request(`/tasks/${id}/move`, { method: 'POST', body: JSON.stringify(move) }),
  createColumn: (title) => request('/columns', { method: 'POST', body: JSON.stringify({ title }) }),
  renameColumn: (id, title) => request(`/columns/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteColumn: (id) => request(`/columns/${id}`, { method: 'DELETE' }),
};
