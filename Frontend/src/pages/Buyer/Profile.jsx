import React, { useEffect, useState } from "react";
import api from "../../api";
import "./Profile.css";
import "../Supplier/Profile.css"; // reuse status-dot styles

export default function BuyerProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [imageKey, setImageKey] = useState(0);

  const fetchProfile = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get("/api/buyer/profile");
      setProfile(res.data);
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

  if (loading) return <div className="profile-card">Loading profile...</div>;
  if (error) return <div className="profile-card error">{error}</div>;
  if (!profile) return <div className="profile-card">No profile data.</div>;

  const { fullName, role, email, joinedAt, profileImageUrl, email_verified } = profile;

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
            {email_verified ? (
              <span className="badge badge-success">Verified</span>
            ) : (
              <span className="badge badge-warning">Unverified</span>
            )}
          </p>
        </div>
      </div>

      <div className="profile-grid">
        <div className="profile-field">
          <span className="label">Date Joined</span>
          <span>{joinedAt ? new Date(joinedAt).toLocaleDateString() : "—"}</span>
        </div>
      </div>
    </div>
  );
}
