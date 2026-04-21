import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export class ConfigManager {
  private configDir: string;
  private appPath: string;
  private projectRoot: string;

  constructor() {
    this.configDir = path.join(app.getPath('userData'), 'config');
    this.appPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app')
      : path.join(__dirname, '../app');
    this.projectRoot = path.join(__dirname, '../..');
  }

  private log(message: string): void {
    console.log(`[ConfigManager] ${message}`);
  }

  public async initialize(): Promise<void> {
    this.log('Initializing configuration...');

    // Ensure config directory exists
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
      this.log(`Created config directory: ${this.configDir}`);
    }

    // Check if already initialized
    const markerFile = path.join(this.configDir, '.initialized');
    if (fs.existsSync(markerFile)) {
      this.log('Configuration already initialized');
      return;
    }

    // Copy configuration templates
    await this.copyConfigTemplates();

    // Create subdirectories
    this.createSubdirectories();

    // Create default SOUL.md
    this.createDefaultSoul();

    // Mark as initialized
    fs.writeFileSync(markerFile, new Date().toISOString());
    this.log('Configuration initialization complete');
  }

  private async copyConfigTemplates(): Promise<void> {
    const hermesHome = app.getPath('userData');
    const envSrc = this.resolveTemplatePath('.env.example');
    const configSrc = this.resolveTemplatePath('cli-config.yaml.example');

    // .env goes to HERMES_HOME root (not config/)
    const envDest = path.join(hermesHome, '.env');
    if (fs.existsSync(envSrc) && !fs.existsSync(envDest)) {
      try {
        fs.copyFileSync(envSrc, envDest);
        this.log(`Copied .env.example -> .env (HERMES_HOME)`);
      } catch (error) {
        this.log(`Warning: Failed to copy .env: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // config.yaml goes to HERMES_HOME root as well
    const configDest = path.join(hermesHome, 'config.yaml');
    if (fs.existsSync(configSrc) && !fs.existsSync(configDest)) {
      try {
        fs.copyFileSync(configSrc, configDest);
        this.log(`Copied cli-config.yaml.example -> config.yaml (HERMES_HOME)`);
      } catch (error) {
        this.log(`Warning: Failed to copy config.yaml: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private resolveTemplatePath(filename: string): string {
    const candidates = [
      path.join(this.appPath, 'config', filename),
      path.join(this.appPath, filename),
      path.join(this.projectRoot, filename),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return candidates[0];
  }

  private createSubdirectories(): void {
    const subdirs = [
      'cron',
      'logs',
      'sessions',
      'memories',
      'sandboxes',
      'platforms',
      'bin',
    ];

    for (const dir of subdirs) {
      const dirPath = path.join(this.configDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        this.log(`Created directory: ${dir}/`);
      }
    }

    // Copy skills from bundled app
    this.copySkills();
  }

  private copySkills(): void {
    const skillsSourceDir = path.join(this.appPath, 'skills');
    const skillsDestDir = path.join(this.configDir, 'skills');

    if (!fs.existsSync(skillsSourceDir)) {
      this.log('Warning: No skills directory in app bundle');
      return;
    }

    if (fs.existsSync(skillsDestDir)) {
      this.log('Skills directory already exists, skipping');
      return;
    }

    try {
      // Copy entire skills directory
      this.copyDirectoryRecursive(skillsSourceDir, skillsDestDir);
      this.log('Copied skills directory');
    } catch (error) {
      this.log(`Warning: Failed to copy skills: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private copyDirectoryRecursive(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectoryRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private createDefaultSoul(): void {
    const soulPath = path.join(app.getPath('userData'), 'SOUL.md');

    if (fs.existsSync(soulPath)) {
      return;
    }

    // Use the same default SOUL as CLI (from hermes_cli/default_soul.py)
    const defaultSoul = `You are Hermes Agent, an intelligent AI assistant created by Nous Research. You are helpful, knowledgeable, and direct. You assist users with a wide range of tasks including answering questions, writing and editing code, analyzing information, creative work, and executing actions via your tools. You communicate clearly, admit uncertainty when appropriate, and prioritize being genuinely useful over being verbose unless otherwise directed below. Be targeted and efficient in your exploration and investigations.`;

    fs.writeFileSync(soulPath, defaultSoul);
    this.log('Created default SOUL.md');
  }

  public getConfigDir(): string {
    return this.configDir;
  }

  public getConfigPath(filename: string): string {
    return path.join(this.configDir, filename);
  }

  public needsOnboarding(): boolean {
    const markerFile = path.join(this.configDir, '.onboarding-complete');
    return !fs.existsSync(markerFile);
  }

  public markOnboardingComplete(): void {
    const markerFile = path.join(this.configDir, '.onboarding-complete');
    fs.writeFileSync(markerFile, new Date().toISOString());
    this.log('Onboarding marked as complete');
  }
}
