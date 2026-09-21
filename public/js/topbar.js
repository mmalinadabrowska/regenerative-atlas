/**
 * The top bar's menu on a narrow screen.
 *
 * A row of section buttons is the whole navigation on a wide screen and two
 * wrapped lines of it on a phone, where the map has less room than anything
 * else on the site. So on a phone the row folds into a button at the left of
 * the bar and drops out of it when asked.
 *
 * The markup is the same either way — the same nav, the same links — because a
 * second copy of the navigation is a second thing to keep in step, and because
 * with the script missing the row is still a row.
 */

const button = document.getElementById('site-menu-button');
const menu = document.getElementById('site-menu');
const bar = button?.closest('.topbar');

if (button && menu && bar) {
  const open = () => bar.classList.contains('is-menu-open');

  function setMenu(next) {
    bar.classList.toggle('is-menu-open', next);
    button.setAttribute('aria-expanded', String(next));
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    setMenu(!open());
  });

  // Anywhere else puts it away — but not on the press, and not inside the menu
  // itself: closing a menu under a finger that is still coming down takes the
  // link out from under the tap, and the tap lands on the page behind it.
  document.addEventListener('pointerdown', (event) => {
    if (!open() || event.target.closest('#site-menu, #site-menu-button')) return;
    setMenu(false);
  });

  // A link inside it closes it on the click, once the click has been had. Most
  // of them are on their way to another page; the one for the page you are on
  // is not, and would otherwise leave the menu standing open over it.
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenu(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open()) {
      setMenu(false);
      button.focus();
    }
  });

  // Crossing back to the wide layout leaves the menu open behind the row it
  // turns back into.
  window.addEventListener('resize', () => {
    if (open() && getComputedStyle(button).display === 'none') setMenu(false);
  });
}
