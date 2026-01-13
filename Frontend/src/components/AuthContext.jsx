import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [userRole, setUserRole] = useState("");
  const [token, setToken] = useState("");
  const [fullName, setFullName] = useState("");
  const [userID, setUserID] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load from session storage on mount and sync across tabs
  useEffect(() => {
    const storedToken = sessionStorage.getItem("token");
    const storedRole = sessionStorage.getItem("userRole");
    const storedFullName = sessionStorage.getItem("fullName");
    const storedUserID = sessionStorage.getItem("userID");
    const storedEmailVerified = sessionStorage.getItem("emailVerified");

    if (storedToken && storedRole) {
      setToken(storedToken);
      setUserRole(storedRole);
      setFullName(storedFullName || "");
      setUserID(storedUserID || "");
      if (storedEmailVerified !== null) {
        setEmailVerified(storedEmailVerified === "true");
      }
    }
    setIsLoading(false);

    const handleStorageChange = () => {
      const newRole = sessionStorage.getItem("userRole") || "";
      setUserRole(newRole);
      const newEmailVerified = sessionStorage.getItem("emailVerified");
      setEmailVerified(newEmailVerified === "true");
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const updateEmailVerified = (value) => {
    const normalized = !!value;
    setEmailVerified(normalized);
    try {
      sessionStorage.setItem("emailVerified", String(normalized));
    } catch {}
  };

  // Login: Update state and storage
  const login = (data) => {
    const { token: newToken, user } = data;
    setToken(newToken);
    setUserRole(user.role.toLowerCase());
    setFullName(user.fullName);
    setUserID(user.userID);
    updateEmailVerified(user.email_verified);

    sessionStorage.setItem("token", newToken);
    sessionStorage.setItem("userRole", user.role.toLowerCase());
    sessionStorage.setItem("fullName", user.fullName);
    sessionStorage.setItem("userID", user.userID);
    sessionStorage.setItem("emailVerified", String(!!user.email_verified));
  };

  // Logout: Clear state and storage
  const logout = () => {
    setToken("");
    setUserRole("");
    setFullName("");
    setUserID("");
    updateEmailVerified(false);
    sessionStorage.clear();
  };

  return (
    <AuthContext.Provider
      value={{
        userRole,
        token,
        fullName,
        userID,
        emailVerified,
        isLoading,
        login,
        logout,
        setEmailVerified: updateEmailVerified,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};