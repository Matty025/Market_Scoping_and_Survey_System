import React, { useEffect, useState } from "react";
import { useSearchParams, useParams, Link } from "react-router-dom";
import api from "../../api";
import "./VerifyEmail.css";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const params = useParams();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const token = params.token || searchParams.get("token");
    const preToken = searchParams.get("preToken");

    if (!token && !preToken) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }

    const verify = async () => {
      try {
        if (preToken) {
          await api.get(`/auth/pre-verify/consume`, { params: { token: preToken } });
          setStatus("success");
          setMessage("Email verified successfully. Return to registration.");
        } else {
          await api.get(`/api/email/verify/${token}`);
          setStatus("success");
          setMessage("Email verified successfully. You can now log in.");
        }
      } catch (err) {
        const msg = err?.response?.data || "Verification failed or link expired.";
        setStatus("error");
        setMessage(typeof msg === "string" ? msg : "Verification failed or link expired.");
      }
    };

    verify();
  }, [params.token, searchParams]);

  return (
    <div className="verify-page">
      <div className={`verify-card ${status}`}>
        <h2>Email Verification</h2>
        <p>{message}</p>
        {status === "success" ? (
          <Link className="verify-btn" to="/">Go to Login</Link>
        ) : null}
      </div>
    </div>
  );
}
