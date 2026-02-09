/**
 * Görevler sayfası kritik E2E senaryoları
 * Backend (md.service) ve frontend (md.web) çalışıyor olmalı.
 */
import { test, expect } from '@playwright/test';

const uniqueId = () => `E2E-${Date.now()}`;

test.describe('Görevler Sayfası', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('input-username').fill('admin');
    await page.getByTestId('input-password').fill('admin');
    await page.getByTestId('btn-login').click();
    await page.waitForURL(/\/(dashboard|gorevler)/, { timeout: 10000 });
    await page.goto('/gorevler/list');
    await page.waitForSelector('[data-testid="gorevler-page"]', { timeout: 10000 });
  });

  test('1) /gorevler sayfası açılıyor mu (başlık + ana elementler)', async ({ page }) => {
    await expect(page.getByTestId('gorevler-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Görevler/i })).toBeVisible();
    await expect(page.getByTestId('btn-new-task')).toBeVisible();
    await expect(page.getByTestId('tasks-table-card')).toBeVisible();
  });

  test('2) Yeni görev oluştur -> kaydet -> listede görünüyor mu', async ({ page }) => {
    const baslik = `Yeni Görev ${uniqueId()}`;
    await page.getByTestId('btn-new-task').click();
    await page.getByTestId('input-task-baslik').fill(baslik);
    await page.getByTestId('btn-task-save').click();
    await page.waitForTimeout(800);
    await expect(page.getByText(baslik)).toBeVisible({ timeout: 5000 });
  });

  test('3) Göreve kişi ata -> kaydet -> listede doğru görünüm', async ({ page }) => {
    const baslik = `Atama Test Kişi ${uniqueId()}`;
    await page.getByTestId('btn-new-task').click();
    await page.getByTestId('input-task-baslik').fill(baslik);
    await page.getByTestId('btn-task-save').click();
    await page.waitForTimeout(800);
    const row = page.getByRole('row').filter({ hasText: baslik });
    await row.getByTestId('btn-assign').click();
    await page.getByTestId('select-assignee').selectOption({ value: 'PER-001' });
    await page.getByTestId('btn-assign-submit').click();
    await page.waitForTimeout(800);
    await expect(page.getByRole('row').filter({ hasText: baslik })).toContainText('Murat');
  });

  test('4) Göreve ekip ata -> kaydet -> listede doğru görünüm', async ({ page }) => {
    const baslik = `Atama Test Ekip ${uniqueId()}`;
    await page.getByTestId('btn-new-task').click();
    await page.getByTestId('input-task-baslik').fill(baslik);
    await page.getByTestId('btn-task-save').click();
    await page.waitForTimeout(800);
    const row = page.getByRole('row').filter({ hasText: baslik });
    await row.getByTestId('btn-assign').click();
    await page.getByTestId('select-assignee-type').selectOption('team');
    await page.getByTestId('select-assignee').selectOption({ value: 'TEAM-001' });
    await page.getByTestId('btn-assign-submit').click();
    await page.waitForTimeout(800);
    await expect(page.getByRole('row').filter({ hasText: baslik })).toContainText('Üretim');
  });

  test('5) Listeden seç -> edit -> kaydet -> değişiklik yansıyor mu', async ({ page }) => {
    const baslik = `Edit Test ${uniqueId()}`;
    await page.getByTestId('btn-new-task').click();
    await page.getByTestId('input-task-baslik').fill(baslik);
    await page.getByTestId('btn-task-save').click();
    await page.waitForTimeout(800);
    const row = page.getByRole('row').filter({ hasText: baslik });
    await row.getByTestId('btn-edit').click();
    const updatedBaslik = `${baslik} Güncellendi`;
    await page.getByTestId('input-task-baslik').fill(updatedBaslik);
    await page.getByTestId('btn-task-save').click();
    await page.waitForTimeout(800);
    await expect(page.getByText(updatedBaslik)).toBeVisible({ timeout: 5000 });
  });
});
