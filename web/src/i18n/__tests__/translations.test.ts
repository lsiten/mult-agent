import { en } from '../en';
import { zh } from '../zh';

describe('i18n translations', () => {
  it("should have director office translations", () => {
    expect(en.organization.directorOffice).toBeDefined();
    expect(zh.organization.directorOffice).toBeDefined();
    expect(en.organization.directorOffice.initDirectorOffice).toBeDefined();
    expect(zh.organization.directorOffice.initDirectorOffice).toBeDefined();
  });
});
