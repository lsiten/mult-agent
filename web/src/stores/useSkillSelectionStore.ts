import { create } from 'zustand';

export interface Skill {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  path: string;
}

interface SkillSelectionState {
  // All available skills
  skills: Skill[];

  // Currently selected skill names
  selectedSkills: string[];

  // Loading state
  loading: boolean;

  // Error state
  error: string | null;

  // Actions
  setSkills: (skills: Skill[]) => void;
  selectSkill: (skillName: string) => void;
  deselectSkill: (skillName: string) => void;
  toggleSkill: (skillName: string) => void;
  clearSelection: () => void;
  setSelectedSkills: (skillNames: string[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSkillSelectionStore = create<SkillSelectionState>((set) => ({
  skills: [],
  selectedSkills: [],
  loading: false,
  error: null,

  setSkills: (skills) => set({ skills }),

  selectSkill: (skillName) =>
    set((state) => ({
      selectedSkills: state.selectedSkills.includes(skillName)
        ? state.selectedSkills
        : [...state.selectedSkills, skillName],
    })),

  deselectSkill: (skillName) =>
    set((state) => ({
      selectedSkills: state.selectedSkills.filter((s) => s !== skillName),
    })),

  toggleSkill: (skillName) =>
    set((state) => ({
      selectedSkills: state.selectedSkills.includes(skillName)
        ? state.selectedSkills.filter((s) => s !== skillName)
        : [...state.selectedSkills, skillName],
    })),

  clearSelection: () => set({ selectedSkills: [] }),

  setSelectedSkills: (skillNames) => set({ selectedSkills: skillNames }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),
}));
