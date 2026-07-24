# CareCareer Design Token Specification

## Selected Direction: Intelligent Enterprise (Direction A + B hybrid)

Premium, analytical, operationally dense. Executive trust with workforce command capability.

---

## Color Tokens

### Core Surfaces
```css
--surface-bg:         #0f172a;   /* Deep ink — sidebar, app shell */
--surface-primary:    #ffffff;   /* White — main content area */
--surface-secondary:  #f8fafc;   /* Cool gray — panel backgrounds */
--surface-tertiary:   #f1f5f9;   /* Lighter gray — card hover, zebra */
--surface-elevated:   #ffffff;   /* Cards, modals, drawers */
--surface-overlay:    rgba(15, 23, 42, 0.6);  /* Modal backdrop */
```

### Brand & Intelligence
```css
--brand-primary:      #0ea5e9;   /* Healthcare teal — primary actions */
--brand-primary-hover:#0284c7;   /* Darker teal — hover state */
--brand-ai:           #8b5cf6;   /* Violet — AI indicators, intelligence */
--brand-ai-subtle:    #ede9fe;   /* Violet wash — AI chip backgrounds */
--brand-accent:       #06b6d4;   /* Cyan — secondary highlights */
```

### Semantic Status
```css
--status-success:     #10b981;   /* Emerald — active, verified, complete */
--status-success-bg:  #ecfdf5;   /* Emerald wash */
--status-warning:     #f59e0b;   /* Amber — attention, expiring */
--status-warning-bg:  #fffbeb;   /* Amber wash */
--status-danger:      #ef4444;   /* Red — critical only */
--status-danger-bg:   #fef2f2;   /* Red wash */
--status-info:        #3b82f6;   /* Blue — informational */
--status-info-bg:     #eff6ff;   /* Blue wash */
--status-neutral:     #64748b;   /* Slate — inactive, pending */
```

### Text
```css
--text-primary:       #0f172a;   /* Main body text */
--text-secondary:     #475569;   /* Labels, descriptions */
--text-tertiary:      #94a3b8;   /* Placeholder, disabled */
--text-inverse:       #ffffff;   /* On dark surfaces */
--text-link:          #0ea5e9;   /* Interactive text */
```

### Borders & Dividers
```css
--border-default:     #e2e8f0;   /* Standard borders */
--border-strong:      #cbd5e1;   /* Emphasized borders */
--border-focus:       #0ea5e9;   /* Focus ring color */
--border-ai:          #8b5cf6;   /* AI-related borders */
```

---

## Typography

### Font Family
```css
--font-sans:          'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono:          'JetBrains Mono', 'Fira Code', monospace;
```

### Scale
```css
--text-xs:            0.75rem;    /* 12px — badges, metadata */
--text-sm:            0.8125rem;  /* 13px — table cells, compact */
--text-base:          0.875rem;   /* 14px — body text (dense UI) */
--text-md:            1rem;       /* 16px — section titles */
--text-lg:            1.125rem;   /* 18px — page section headers */
--text-xl:            1.5rem;     /* 24px — page titles */
--text-2xl:           2rem;       /* 32px — executive metrics */
--text-3xl:           2.5rem;     /* 40px — hero numbers */
```

### Weights
```css
--font-normal:        400;
--font-medium:        500;
--font-semibold:      600;
--font-bold:          700;
```

---

## Spacing Scale

```css
--space-0:   0;
--space-1:   0.25rem;   /* 4px */
--space-2:   0.5rem;    /* 8px */
--space-3:   0.75rem;   /* 12px */
--space-4:   1rem;      /* 16px */
--space-5:   1.25rem;   /* 20px */
--space-6:   1.5rem;    /* 24px */
--space-8:   2rem;      /* 32px */
--space-10:  2.5rem;    /* 40px */
--space-12:  3rem;      /* 48px */
--space-16:  4rem;      /* 64px */
```

---

## Border Radius

```css
--radius-sm:   4px;     /* Badges, chips */
--radius-md:   6px;     /* Buttons, inputs */
--radius-lg:   8px;     /* Cards, panels */
--radius-xl:   12px;    /* Modals, large cards */
--radius-full: 9999px;  /* Avatars, pills */
```

---

## Shadows

```css
--shadow-sm:    0 1px 2px rgba(0,0,0,0.05);
--shadow-md:    0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
--shadow-lg:    0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04);
--shadow-xl:    0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.06);
```

---

## Layout Tokens

```css
--sidebar-width:      240px;
--sidebar-collapsed:  64px;
--header-height:      56px;
--content-max-width:  1440px;
--panel-width:        380px;    /* AI panel, detail drawers */
```

---

## Animation

```css
--duration-fast:      150ms;
--duration-normal:    200ms;
--duration-slow:      300ms;
--easing-default:     cubic-bezier(0.4, 0, 0.2, 1);
--easing-in:          cubic-bezier(0.4, 0, 1, 1);
--easing-out:         cubic-bezier(0, 0, 0.2, 1);
```

---

## Density

The default density is COMFORTABLE for executive views.
Operational views (scheduling, recruiting, time) use COMPACT density.

```css
/* Comfortable (default) */
--row-height:         48px;
--cell-padding:       12px 16px;
--card-padding:       20px;

/* Compact (operational) */
--row-height-compact: 36px;
--cell-padding-compact: 8px 12px;
--card-padding-compact: 12px;
```

---

## Breakpoints

```css
--bp-mobile:    480px;
--bp-tablet:    768px;
--bp-desktop:   1024px;
--bp-wide:      1280px;
--bp-ultra:     1920px;
```

---

## Component Tokens

### Buttons
```css
--btn-height:         36px;
--btn-height-sm:      28px;
--btn-height-lg:      44px;
--btn-radius:         var(--radius-md);
--btn-font:           var(--text-sm);
--btn-font-weight:    var(--font-medium);
```

### Inputs
```css
--input-height:       36px;
--input-radius:       var(--radius-md);
--input-border:       var(--border-default);
--input-focus-ring:   0 0 0 3px rgba(14, 165, 233, 0.15);
```

### Cards
```css
--card-radius:        var(--radius-lg);
--card-border:        1px solid var(--border-default);
--card-shadow:        var(--shadow-sm);
--card-shadow-hover:  var(--shadow-md);
```
