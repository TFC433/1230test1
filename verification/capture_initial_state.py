
from playwright.sync_api import sync_playwright
import time

def take_screenshots():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # --- Light Mode ---
        page = browser.new_page()
        page.goto("http://localhost:3001/dashboard.html")
        # Ensure light mode
        page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
        time.sleep(1) # wait for render
        page.screenshot(path="verification/dashboard_light.png")

        page.goto("http://localhost:3001/leads-view.html")
        page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
        time.sleep(1)
        page.screenshot(path="verification/leads_light.png")

        page.goto("http://localhost:3001/login.html")
        page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
        time.sleep(1)
        page.screenshot(path="verification/login_light.png")

        page.close()

        # --- Dark Mode ---
        page = browser.new_page()
        page.goto("http://localhost:3001/dashboard.html")
        # Ensure dark mode (remove attribute or set to dark if applicable, script defaults to variable check but let's force it)
        # Based on css: :root is dark, [data-theme="light"] is light.
        # So removing data-theme should show dark mode.
        page.evaluate("document.documentElement.removeAttribute('data-theme')")
        time.sleep(1)
        page.screenshot(path="verification/dashboard_dark.png")

        page.goto("http://localhost:3001/leads-view.html")
        page.evaluate("document.documentElement.removeAttribute('data-theme')")
        time.sleep(1)
        page.screenshot(path="verification/leads_dark.png")

        page.goto("http://localhost:3001/login.html")
        page.evaluate("document.documentElement.removeAttribute('data-theme')")
        time.sleep(1)
        page.screenshot(path="verification/login_dark.png")

        browser.close()

if __name__ == "__main__":
    take_screenshots()
