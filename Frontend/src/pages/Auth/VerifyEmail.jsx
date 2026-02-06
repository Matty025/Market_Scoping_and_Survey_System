import React, { useEffect, useState } from "react";
import { useSearchParams, useParams, Link } from "react-router-dom";
import api from "../../api";
import "./VerifyEmail.css";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const params = useParams();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Verifying your email...");
  const [isPreVerify, setIsPreVerify] = useState(false);

  useEffect(() => {
    const token = params.token || searchParams.get("token");
    const preToken = searchParams.get("preToken");

    setIsPreVerify(Boolean(preToken));

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
          setMessage("Email verified successfully. Return to your registration tab and click 'I've verified' to continue.");
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
        {status === "success" && isPreVerify ? (
          <p className="verify-hint">Return to the registration tab and press "Continue to Register" to finish signing up.</p>
        ) : null}
        {status === "success" && !isPreVerify ? (
          <p className="verify-hint">Your email is verified. You can now go back to the site and sign in.</p>
        ) : null}
      </div>
    </div>
  );
}
