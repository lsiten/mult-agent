/**
 * ZIP Upload Tab - Upload local skill package
 */

import { useState, useRef, useEffect } from 'react';
import { Upload, FileArchive, AlertCircle, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CategorySelector } from './CategorySelector';
import { api } from '@/lib/api';

interface ZipUploadTabProps {
  onUploadComplete: (taskId: string, skillName: string) => void;
}

export function ZipUploadTab({ onUploadComplete }: ZipUploadTabProps) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch existing categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const skills = await api.getSkills();
        console.log('[ZipUpload] Fetched skills:', skills);
        const categories = new Set<string>();
        skills.forEach((skill) => {
          if (skill.name.includes('/')) {
            const category = skill.name.split('/')[0];
            console.log('[ZipUpload] Found category:', category, 'from skill:', skill.name);
            categories.add(category);
          }
        });
        const categoriesArray = Array.from(categories).sort();
        console.log('[ZipUpload] Available categories:', categoriesArray);
        setExistingCategories(categoriesArray);
      } catch (err) {
        console.error('[ZipUpload] Failed to fetch categories:', err);
      }
    };
    fetchCategories();
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[ZipUpload] Drag event:', e.type);
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    console.log('[ZipUpload] Drop event:', e.dataTransfer.files);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      console.log('[ZipUpload] File dropped:', e.dataTransfer.files[0].name);
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    console.log('[ZipUpload] Processing file:', { name: file.name, size: file.size, type: file.type });
    setError(null);

    // Validate file type
    if (!file.name.endsWith('.zip')) {
      console.error('[ZipUpload] Invalid file type:', file.name);
      setError(t.skills.install.uploadZip.invalidFile);
      return;
    }

    // Validate file size (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      console.error('[ZipUpload] File too large:', file.size);
      setError(t.skills.install.uploadZip.fileTooLarge);
      return;
    }

    // Upload file
    console.log('[ZipUpload] Starting upload...');
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedCategory) {
        formData.append('category', selectedCategory);
        console.log('[ZipUpload] Uploading with category:', selectedCategory);
      } else {
        console.log('[ZipUpload] Uploading without category (root)');
      }

      const response = await fetch('/api/skills/upload', {
        method: 'POST',
        headers: {
          // Authorization auto-added by api.fetchJSON
        },
        body: formData,
      });

      console.log('[ZipUpload] Upload response status:', response.status);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[ZipUpload] Upload complete:', data);

      // Validation phase
      setUploading(false);
      setValidating(true);

      // Notify parent of upload completion
      onUploadComplete(data.task_id, data.skill_name);
      console.log('[ZipUpload] Upload complete callback triggered');
    } catch (err) {
      console.error('[ZipUpload] Upload failed:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setValidating(false);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Category Selector */}
      <CategorySelector
        value={selectedCategory}
        onChange={setSelectedCategory}
        existingCategories={existingCategories}
      />

      {/* Dropzone */}
      <Card
        className={`border-2 border-dashed transition-colors cursor-pointer ${
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50'
        } ${uploading || validating ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <CardContent className="p-12">
          <div className="flex flex-col items-center justify-center text-center gap-4">
            {uploading || validating ? (
              <>
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                <div>
                  <p className="text-sm font-medium">
                    {uploading
                      ? t.skills.install.uploadZip.uploading
                      : t.skills.install.uploadZip.validating}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.common.loading}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 rounded-full bg-primary/10">
                  <FileArchive className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">
                    {t.skills.install.uploadZip.dropzoneText}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.skills.install.uploadZip.maxSize}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFileDialog();
                  }}
                >
                  <Upload className="h-4 w-4" />
                  {t.skills.install.uploadZip.selectFile}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Instructions */}
      <div className="text-xs text-muted-foreground space-y-1 px-1">
        <p>• {t.skills.install.uploadZip.maxSize}</p>
        <p>• {t.skills.install.uploadZip.requirements}</p>
        <p>• {t.skills.install.uploadZip.trustedOnly}</p>
      </div>
    </div>
  );
}
