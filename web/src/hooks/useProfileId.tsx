import { createContext, useContext } from 'react';
import type { ProfileRef } from '../lib/api';

/** Backend profile (and persona) of the active portfolio or account; profileId null when none was computed. */
const ProfileRefContext = createContext<ProfileRef>({ profileId: null });
export const ProfileRefProvider = ProfileRefContext.Provider;
export const useProfileRef = () => useContext(ProfileRefContext);
