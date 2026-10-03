// Thin wrapper around fetch for talking to Django.
//
// Auth is Django's session cookie. Requests that change data must also send
// the CSRF token, which Django keeps in the `csrftoken` cookie.

function getCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function request(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRFToken"] = getCookie("csrftoken") ?? "";

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback =
      response.status >= 500
        ? "Something went wrong on the server. Try again in a moment."
        : `Request failed (${response.status})`;
    throw new ApiError(data.error || data.detail || fallback, response.status, data);
  }
  return data;
}

export const authApi = {
  session: () => request("/auth/session/"),
  google: (credential) => request("/auth/google/", { method: "POST", body: { credential } }),
  dev: (email) => request("/auth/dev/", { method: "POST", body: { email } }),
  signOut: () => request("/auth/sign-out/", { method: "POST" }),
};

export const driversApi = {
  list: () => request("/drivers/"),
  colors: () => request("/drivers/colors/"),
  create: (driver) => request("/drivers/", { method: "POST", body: driver }),
  update: (id, changes) => request(`/drivers/${id}/`, { method: "PATCH", body: changes }),
  remove: (id) => request(`/drivers/${id}/`, { method: "DELETE" }),
};

export const ridesApi = {
  list: (date) => request(`/rides/?date=${encodeURIComponent(date)}`),
  create: (ride) => request("/rides/", { method: "POST", body: ride }),
  update: (id, changes) => request(`/rides/${id}/`, { method: "PATCH", body: changes }),
  remove: (id) => request(`/rides/${id}/`, { method: "DELETE" }),
  start: (id) => request(`/rides/${id}/start/`, { method: "POST" }),
  unstart: (id) => request(`/rides/${id}/unstart/`, { method: "POST" }),
};

export const archiveApi = {
  days: () => request("/archive/days/"),
  list: (date) => request(`/archive/?date=${encodeURIComponent(date)}`),
};

export const locationApi = {
  send: ({ lat, lng, accuracy }) => request("/location/", { method: "POST", body: { lat, lng, accuracy } }),
};

// Public rider endpoints: no sign-in, the ride link token is the key.
export const riderApi = {
  page: (token) => request(`/r/${encodeURIComponent(token)}/`),
  confirm: (token) => request(`/r/${encodeURIComponent(token)}/confirm/`, { method: "POST" }),
  pins: (token, pins) => request(`/r/${encodeURIComponent(token)}/pins/`, { method: "PUT", body: pins }),
  lookup: (phone) => request(`/lookup/?phone=${encodeURIComponent(phone)}`),
};
