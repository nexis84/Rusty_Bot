/* Shared click-to-enlarge lightbox for Fractured Skies pages. */
(function () {
  'use strict';

  function init() {
    var explicit = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox-src]'));

    var auto = Array.prototype.slice.call(document.querySelectorAll('img')).filter(function (img) {
      if (img.closest('[data-lightbox-src], .lightbox, #imageLightbox')) return false;
      if (img.classList.contains('brand-logo')) return false;
      if (img.hasAttribute('data-lightbox-skip')) return false;
      var width = parseInt(img.getAttribute('width'), 10) || img.naturalWidth || 0;
      return width >= 400;
    });

    if (!explicit.length && !auto.length) return;

    var dialog = document.getElementById('imageLightbox');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'lightbox';
      dialog.id = 'imageLightbox';
      dialog.setAttribute('aria-label', 'Enlarged image');
      dialog.innerHTML =
        '<div class="lightbox-inner">' +
          '<button class="lightbox-close" type="button" aria-label="Close enlarged image">&times;</button>' +
          '<img id="lightboxImage" alt="">' +
          '<p class="lightbox-caption" id="lightboxCaption"></p>' +
        '</div>';
      document.body.appendChild(dialog);
    }

    var image = dialog.querySelector('#lightboxImage');
    var caption = dialog.querySelector('#lightboxCaption');
    var close = dialog.querySelector('.lightbox-close');

    function open(src, alt, captionText) {
      if (!src) return;
      image.src = src;
      image.alt = alt || '';
      caption.textContent = captionText || alt || '';
      document.body.classList.add('lightbox-open');
      if (!dialog.open) dialog.showModal();
    }

    explicit.forEach(function (trigger) {
      trigger.addEventListener('click', function (event) {
        event.preventDefault();
        var inner = trigger.querySelector('img');
        open(
          trigger.getAttribute('data-lightbox-src'),
          trigger.getAttribute('data-lightbox-alt') || (inner ? inner.alt : ''),
          trigger.getAttribute('data-lightbox-caption') || ''
        );
      });
    });

    auto.forEach(function (img) {
      img.setAttribute('data-lightbox-ready', '');
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      if (!img.getAttribute('title')) img.setAttribute('title', 'Click to enlarge');
      if (!img.getAttribute('aria-label')) {
        img.setAttribute('aria-label', 'Enlarge image' + (img.alt ? ': ' + img.alt : ''));
      }

      function enlarge(event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        open(img.currentSrc || img.src, img.alt, img.alt);
      }

      img.addEventListener('click', enlarge);
      img.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') enlarge(event);
      });
    });

    if (close) {
      close.addEventListener('click', function () { dialog.close(); });
    }

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });

    dialog.addEventListener('close', function () {
      document.body.classList.remove('lightbox-open');
      image.removeAttribute('src');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
