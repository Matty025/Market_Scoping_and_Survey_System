import React, { useEffect, useState } from "react";
import api from "../../api";
import { useAuth } from "../../components/AuthContext";
import "./Profile.css";
import "../Supplier/Profile.css"; // reuse status-dot styles

export default function BuyerProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [imageKey, setImageKey] = useState(0);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState("");
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [sendDisableUntil, setSendDisableUntil] = useState(0);
  const [editDisableUntil, setEditDisableUntil] = useState(0);
  const { setEmailVerified } = useAuth();

  const fetchProfile = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get("/api/buyer/profile");
      setProfile(res.data);
      setEmailVerified(!!res.data?.email_verified);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load profile.";
      setError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await api.post("/api/buyer/profile/avatar", formData);
      setProfile((prev) => (prev ? { ...prev, profileImageUrl: res.data.profileImageUrl } : prev));
      setImageKey((k) => k + 1);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to update profile picture.";
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarError = () => {
    fetchProfile({ silent: true });
    setImageKey((k) => k + 1);
  };

  const handleSendVerification = async (emailOverride) => {
    const emailToUse = emailOverride || profile?.email;
    if (!profile?.userID && !profile?.id) {
      setError("Missing user info to send verification email.");
      return;
    }

    setError("");
    setVerifyStatus("sending");
    try {
      await api.post("/api/email/verify", {
        userId: profile.userID || profile.id,
        email: emailToUse,
      });
      setVerifyStatus("sent");
      setSendDisableUntil(Date.now() + 60 * 1000);
    } catch (err) {
      const retry = err?.response?.data?.retryInSeconds;
      if (retry) {
        setSendDisableUntil(Date.now() + retry * 1000);
      }
      const msg = err?.response?.data?.error || err?.response?.data?.message || "Failed to send verification email.";
      setError(msg);
      setVerifyStatus("error");
    }
  };

  const openVerifyModal = () => {
    if (email_verified && Date.now() < editDisableUntil) {
      const seconds = Math.ceil((editDisableUntil - Date.now()) / 1000);
      setError(`Please wait ${seconds}s before editing again.`);
      return;
    }
    setEmailInput(profile?.email || "");
    setVerifyStatus("");
    setError("");
    setShowVerifyModal(true);
  };

  const handleConfirmVerify = async () => {
    if (!emailInput) {
      setError("Email is required");
      return;
    }
    setSavingEmail(true);
    setError("");
    try {
      if (emailInput.trim().toLowerCase() === (profile?.email || "").toLowerCase()) {
        await handleSendVerification(emailInput.trim());
      } else {
        const res = await api.patch("/auth/email", { email: emailInput.trim() });
        const updated = res.data?.user;
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                email: updated?.email || emailInput.trim(),
                email_verified: updated?.email_verified ?? false,
              }
            : prev
        );
        setEmailVerified(!!updated?.email_verified);
        setEditDisableUntil(Date.now() + 60 * 1000);
        setVerifyStatus("sent");
      }
      setShowVerifyModal(false);
    } catch (err) {
      const retry = err?.response?.data?.retryInSeconds;
      if (retry) {
        setEditDisableUntil(Date.now() + retry * 1000);
      }
      const msg =
        err?.response?.data?.message || err?.response?.data?.error || "Failed to process verification.";
      setError(msg);
      setVerifyStatus("error");
    } finally {
      setSavingEmail(false);
    }
  };

  if (loading) return <div className="profile-card">Loading profile...</div>;
  if (error) return <div className="profile-card error">{error}</div>;
  if (!profile) return <div className="profile-card">No profile data.</div>;

  const { fullName, role, email, joinedAt, profileImageUrl, email_verified } = profile;
  const isEditDisabled = Date.now() < editDisableUntil;

  return (
    <div className="profile-card">
      <div className="profile-header">
        <div className="avatar-wrap">
          <img
            key={imageKey}
            src={profileImageUrl || "https://via.placeholder.com/120x120.png?text=Avatar"}
            alt="Profile"
            className="avatar"
            onError={handleAvatarError}
            onClick={() => setShowAvatarModal(true)}
          />
          <label className="avatar-upload">
            <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={uploading} />
            {uploading ? "Uploading..." : "Change photo"}
          </label>
        </div>
        <div className="profile-main">
          <h2>{fullName}</h2>
          <p className="muted">{role || "Buyer"}</p>
          <p style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                className={`status-dot ${email_verified ? "verified" : "unverified"}`}
                title={email_verified ? "Email verified" : "Email not verified"}
              />
              <span>{email}</span>
            </span>
            <>
              <span className={email_verified ? "badge-verified" : "badge-unverified"}>
                {email_verified ? "Verified" : "Unverified"}
              </span>
              <button
                className="verify-btn edit"
                onClick={openVerifyModal}
                disabled={isEditDisabled || savingEmail}
              >
                {isEditDisabled ? "Edit later" : "Edit email"}
              </button>
            </>
          </p>
        </div>
      </div>

      <div className="profile-grid">
        <div className="profile-field">
          <span className="label">Date Joined</span>
          <span>{joinedAt ? new Date(joinedAt).toLocaleDateString() : "—"}</span>
        </div>
      </div>

        {showAvatarModal && (
          <div className="verify-modal-backdrop" onClick={() => setShowAvatarModal(false)}>
            <div className="avatar-lightbox" onClick={(e) => e.stopPropagation()}>
              <img
                src={profileImageUrl || "https://via.placeholder.com/400x400.png?text=Avatar"}
                alt="Avatar enlarged"
                className="avatar-enlarged"
                onError={handleAvatarError}
              />
            </div>
          </div>
        )}

        {showVerifyModal && (
          <div className="verify-modal-backdrop" onClick={() => setShowVerifyModal(false)}>
            <div className="verify-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Verify email</h3>
              <p style={{ margin: "0 0 10px", color: "#b91c1c", fontSize: 13 }}>
                Use a Gmail address you own. It must not be used by another account. Sending is limited (cooldown and daily caps apply).
              </p>
              <div className="field">
                <label>Current email</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>
              <div className="actions">
                <button className="btn-secondary" onClick={() => setShowVerifyModal(false)} disabled={savingEmail}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleConfirmVerify} disabled={savingEmail}>
                  {savingEmail ? "Working..." : "Send verification"}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
