import { useEffect, useRef, useState } from "react";

// Renders Google's official "Sign in with Google" button.
// Google calls onCredential with a signed ID token, which the server verifies.

let scriptPromise;
function loadGoogleScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new Error("Couldn't load Google sign-in. Check your connection and reload."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function GoogleButton({ clientId, onCredential }) {
  const container = useRef(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !container.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => callback.current(response.credential),
        });
        window.google.accounts.id.renderButton(container.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          width: 280,
        });
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (error) return <p className="error">{error}</p>;
  return <div ref={container} className="google-button" />;
}
