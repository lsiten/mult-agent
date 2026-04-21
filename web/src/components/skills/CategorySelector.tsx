/**
 * Category Selector - Select or create category for skill installation
 */

import { useState, useEffect } from 'react';
import { Folder, Plus } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CategorySelectorProps {
  value: string;
  onChange: (category: string) => void;
  existingCategories?: string[];
}

export function CategorySelector({
  value,
  onChange,
  existingCategories = [],
}: CategorySelectorProps) {
  const { t } = useI18n();
  const [isCreating, setIsCreating] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [internalValue, setInternalValue] = useState(value);

  // Debug: log props
  useEffect(() => {
    console.log('[CategorySelector] Received existingCategories:', existingCategories);
  }, [existingCategories]);

  // Sync internal value with external prop (but ignore "__new__")
  useEffect(() => {
    if (value !== '__new__') {
      setInternalValue(value);
    }
  }, [value]);

  const handleSelectChange = (selectedValue: string) => {
    console.log('[CategorySelector] Select changed:', selectedValue);
    if (selectedValue === '__new__') {
      setIsCreating(true);
      setNewCategoryName('');
      // Don't change internalValue or call onChange
    } else {
      setIsCreating(false);
      setInternalValue(selectedValue);
      onChange(selectedValue);
    }
  };

  const handleNewCategorySubmit = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      // If empty, cancel and keep current value
      setIsCreating(false);
      setNewCategoryName('');
      return;
    }

    // Validate category name (kebab-case)
    const sanitized = trimmed
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    console.log('[CategorySelector] Creating new category:', sanitized);
    if (sanitized) {
      setIsCreating(false);
      setNewCategoryName('');
      setInternalValue(sanitized);
      onChange(sanitized);
    }
  };

  const handleCancelCreation = () => {
    setIsCreating(false);
    setNewCategoryName('');
    // Keep current internal value, don't change anything
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNewCategorySubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelCreation();
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        {t.skills.install.uploadZip.selectCategory}
      </Label>
      <p className="text-xs text-muted-foreground">
        {t.skills.install.uploadZip.categoryDescription}
      </p>

      {isCreating ? (
        <div className="space-y-1.5">
          <Input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.skills.install.uploadZip.categoryPlaceholder}
            className="text-sm"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Enter ✓ | Esc ✗
          </p>
        </div>
      ) : (
        <div className="relative">
          <Folder className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
          <Select value={internalValue || ''} onValueChange={handleSelectChange} className="w-full">
            <SelectItem value="">
              {t.skills.install.uploadZip.rootCategory}
            </SelectItem>
            {existingCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
            <SelectItem value="__new__">
              {`➕ ${t.skills.install.uploadZip.newCategory}`}
            </SelectItem>
          </Select>
        </div>
      )}
    </div>
  );
}
