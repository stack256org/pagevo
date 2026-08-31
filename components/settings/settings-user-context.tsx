"use client";

import { createContext, useContext, useState } from "react";

interface SettingsUser {
  email: string;
  image: string | null;
  name: string | null;
}
interface Ctx {
  updateUser: (patch: Partial<SettingsUser>) => void;
  user: SettingsUser;
}

const SettingsUserCtx = createContext<Ctx>({
  user: { name: null, email: "", image: null },
  updateUser: () => {},
});

export function SettingsUserProvider({
  initial,
  children,
}: {
  initial: SettingsUser;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<SettingsUser>(initial);
  function updateUser(patch: Partial<SettingsUser>) {
    setUser((u) => ({ ...u, ...patch }));
  }
  return (
    <SettingsUserCtx.Provider value={{ user, updateUser }}>
      {children}
    </SettingsUserCtx.Provider>
  );
}

export function useSettingsUser() {
  return useContext(SettingsUserCtx);
}
