/* @ds-bundle: {"format":4,"namespace":"GauzpanHubDesignSystem_74fce8","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"Card","sourcePath":"components/cards/Card.jsx"},{"name":"TextInput","sourcePath":"components/forms/TextInput.jsx"},{"name":"Footer","sourcePath":"components/layout/Footer.jsx"},{"name":"Link","sourcePath":"components/navigation/Link.jsx"},{"name":"NavBar","sourcePath":"components/navigation/NavBar.jsx"},{"name":"PillTab","sourcePath":"components/navigation/PillTab.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"0faafa6f37a4","components/cards/Card.jsx":"eb4226ed9d0c","components/forms/TextInput.jsx":"2acb520d1e05","components/layout/Footer.jsx":"f9615c043110","components/navigation/Link.jsx":"5b7473483156","components/navigation/NavBar.jsx":"145d19ce502a","components/navigation/PillTab.jsx":"ff584275ce98"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.GauzpanHubDesignSystem_74fce8 = window.GauzpanHubDesignSystem_74fce8 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/Button.jsx
try { (() => {
const VARIANTS = {
  'primary-dark': {
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none'
  },
  'secondary-outline': {
    background: 'var(--color-canvas)',
    color: 'var(--color-ink)',
    border: '1px solid var(--color-hairline-dark)'
  },
  'on-dark-pill': {
    background: 'var(--color-violet-soft)',
    color: 'var(--color-primary-deep)',
    border: 'none',
    borderRadius: 'var(--radius-full)'
  },
  'on-teal': {
    background: 'var(--color-canvas)',
    color: 'var(--color-teal-deep)',
    border: 'none'
  }
};
function Button({
  variant = 'primary-dark',
  size = 'md',
  disabled = false,
  children,
  onClick
}) {
  const v = VARIANTS[variant] || VARIANTS['primary-dark'];
  const [pressed, setPressed] = React.useState(false);
  const bg = pressed && variant === 'primary-dark' ? 'var(--color-primary-deep)' : v.background;
  const pad = size === 'sm' ? '8px 16px' : '12px 20px';
  const style = {
    background: bg,
    color: v.color,
    border: v.border || 'none',
    borderRadius: v.borderRadius || 'var(--radius-md)',
    padding: pad,
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-button-md-size)',
    fontWeight: 'var(--text-button-md-weight)',
    lineHeight: 'var(--text-button-md-lh)',
    letterSpacing: 'var(--text-button-md-ls)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background 0.15s ease'
  };
  return React.createElement('button', {
    style,
    disabled,
    onClick,
    onMouseDown: () => setPressed(true),
    onMouseUp: () => setPressed(false),
    onMouseLeave: () => setPressed(false)
  }, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/cards/Card.jsx
try { (() => {
const VARIANTS = {
  'feature-light': {
    background: 'var(--color-canvas)',
    color: 'var(--color-ink)',
    border: '1px solid var(--color-hairline)',
    padding: 'var(--space-xxl)',
    borderRadius: 'var(--radius-lg)'
  },
  'pricing': {
    background: 'var(--color-canvas)',
    color: 'var(--color-ink)',
    border: '1px solid var(--color-hairline)',
    padding: 'var(--space-xxl)',
    borderRadius: 'var(--radius-lg)'
  },
  'pricing-featured': {
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none',
    padding: 'var(--space-xxl)',
    borderRadius: 'var(--radius-lg)'
  },
  'teal-band': {
    background: 'var(--color-teal-deep)',
    color: 'var(--color-on-primary)',
    border: 'none',
    padding: 'var(--space-huge)',
    borderRadius: 'var(--radius-lg)'
  },
  'feature-row': {
    background: 'var(--color-canvas-soft)',
    color: 'var(--color-ink)',
    border: 'none',
    padding: 'var(--space-xl)',
    borderRadius: 'var(--radius-md)'
  }
};
function Card({
  variant = 'feature-light',
  children
}) {
  const v = VARIANTS[variant] || VARIANTS['feature-light'];
  return React.createElement('div', {
    style: {
      ...v,
      boxSizing: 'border-box',
      fontFamily: 'var(--font-body)'
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/Card.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextInput.jsx
try { (() => {
function TextInput({
  placeholder,
  value,
  onChange,
  disabled = false,
  type = 'text'
}) {
  const style = {
    background: 'var(--color-canvas)',
    color: 'var(--color-ink)',
    border: '1px solid var(--color-hairline)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 12px',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-body-md-size)',
    fontWeight: 'var(--text-body-md-weight)',
    lineHeight: 'var(--text-body-md-lh)',
    width: '100%',
    boxSizing: 'border-box',
    opacity: disabled ? 0.5 : 1,
    outline: 'none'
  };
  return React.createElement('input', {
    style,
    placeholder,
    value,
    onChange,
    disabled,
    type
  });
}
Object.assign(__ds_scope, { TextInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextInput.jsx", error: String((e && e.message) || e) }); }

// components/layout/Footer.jsx
try { (() => {
function Footer({
  columns = [{
    title: 'Product',
    links: ['Overview', 'Pricing', 'Changelog']
  }, {
    title: 'Company',
    links: ['About', 'Careers', 'Contact']
  }, {
    title: 'Resources',
    links: ['Docs', 'Blog', 'Support']
  }, {
    title: 'Legal',
    links: ['Privacy', 'Terms']
  }]
}) {
  const style = {
    background: 'var(--color-canvas)',
    color: 'var(--color-ink-mute)',
    padding: 'var(--space-huge) var(--space-xl)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-caption-size)'
  };
  return React.createElement('div', {
    style
  }, React.createElement('div', {
    style: {
      display: 'flex',
      gap: '48px',
      marginBottom: '32px'
    }
  }, columns.map((c, i) => React.createElement('div', {
    key: i
  }, React.createElement('div', {
    style: {
      color: 'var(--color-ink)',
      fontWeight: 600,
      marginBottom: '12px'
    }
  }, c.title), c.links.map((l, j) => React.createElement('div', {
    key: j,
    style: {
      marginBottom: '8px'
    }
  }, l))))), React.createElement('div', {
    style: {
      borderTop: '1px solid var(--color-hairline)',
      paddingTop: '16px'
    }
  }, '© 2026 Gauzpan Hub. All rights reserved.'));
}
Object.assign(__ds_scope, { Footer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Footer.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Link.jsx
try { (() => {
function Link({
  href = '#',
  children
}) {
  const style = {
    color: 'var(--color-ink)',
    textDecoration: 'underline',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-body-md-size)'
  };
  return React.createElement('a', {
    href,
    style
  }, children);
}
Object.assign(__ds_scope, { Link });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Link.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavBar.jsx
try { (() => {
function NavBar({
  variant = 'light',
  logo = 'Gauzpan Hub',
  links = ['Product', 'Pricing', 'Docs'],
  ctaLabel = 'Get Started'
}) {
  const dark = variant === 'dark';
  const style = {
    background: dark ? 'var(--color-primary)' : 'var(--color-canvas)',
    color: dark ? 'var(--color-on-primary)' : 'var(--color-ink)',
    padding: 'var(--space-lg) var(--space-xl)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-body-md-size)'
  };
  const ctaStyle = dark ? {
    background: 'var(--color-violet-soft)',
    color: 'var(--color-primary)',
    border: 'none',
    borderRadius: 'var(--radius-full)'
  } : {
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none',
    borderRadius: 'var(--radius-md)'
  };
  return React.createElement('div', {
    style
  }, React.createElement('div', {
    style: {
      fontWeight: 600
    }
  }, logo), React.createElement('div', {
    style: {
      display: 'flex',
      gap: '24px'
    }
  }, links.map((l, i) => React.createElement('span', {
    key: i
  }, l))), React.createElement('button', {
    style: {
      ...ctaStyle,
      padding: '8px 16px',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-button-md-size)',
      fontWeight: 'var(--text-button-md-weight)',
      cursor: 'pointer'
    }
  }, ctaLabel));
}
Object.assign(__ds_scope, { NavBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavBar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/PillTab.jsx
try { (() => {
function PillTab({
  label,
  active = false,
  onClick
}) {
  const style = {
    background: 'var(--color-canvas)',
    color: active ? 'var(--color-primary)' : 'var(--color-ink)',
    border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-hairline)',
    borderRadius: 'var(--radius-full)',
    padding: '8px 16px',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-button-cap-size)',
    fontWeight: 'var(--text-button-cap-weight)',
    cursor: 'pointer',
    display: 'inline-block'
  };
  return React.createElement('button', {
    style,
    onClick
  }, label);
}
Object.assign(__ds_scope, { PillTab });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/PillTab.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.TextInput = __ds_scope.TextInput;

__ds_ns.Footer = __ds_scope.Footer;

__ds_ns.Link = __ds_scope.Link;

__ds_ns.NavBar = __ds_scope.NavBar;

__ds_ns.PillTab = __ds_scope.PillTab;

})();
