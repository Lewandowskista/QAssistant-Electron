/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			// ── App semantic tokens ──────────────────────────────────────────
  			// Use these instead of arbitrary hex values like bg-[#0F0F13]
  			surface: {
  				DEFAULT: 'hsl(var(--surface-card) / <alpha-value>)',
  				secondary: 'hsl(var(--surface-card-alt) / <alpha-value>)',
  				alt: 'hsl(var(--surface-card-alt) / <alpha-value>)',
  				muted: 'hsl(var(--surface-card-alt) / <alpha-value>)',
  				elevated: 'hsl(var(--surface-elevated) / <alpha-value>)',
  				overlay: 'hsl(var(--surface-overlay) / <alpha-value>)',
  				app: 'hsl(var(--surface-app) / <alpha-value>)',
  				sidebar: 'hsl(var(--surface-sidebar) / <alpha-value>)',
  				header: 'hsl(var(--surface-header) / <alpha-value>)',
  				selected: 'hsl(var(--surface-selected) / <alpha-value>)',
  				border: 'hsl(var(--border-default))',
  			},
  			line: {
  				DEFAULT: 'hsl(var(--border-default) / <alpha-value>)',
  				subtle: 'hsl(var(--border-subtle) / <alpha-value>)',
  				strong: 'hsl(var(--border-strong) / <alpha-value>)',
  				focus: 'hsl(var(--border-focus) / <alpha-value>)',
  			},
  			text: {
  				primary: 'hsl(var(--text-primary) / <alpha-value>)',
  				secondary: 'hsl(var(--text-secondary) / <alpha-value>)',
  				muted: 'hsl(var(--text-muted) / <alpha-value>)',
  				error: 'hsl(var(--destructive))',
  			},
  			state: {
  				info: 'hsl(var(--state-info) / <alpha-value>)',
  				'info-soft': 'hsl(var(--state-info-soft))',
  				'info-border': 'hsl(var(--state-info-border))',
  				success: 'hsl(var(--state-success) / <alpha-value>)',
  				'success-soft': 'hsl(var(--state-success-soft))',
  				'success-border': 'hsl(var(--state-success-border))',
  				warning: 'hsl(var(--state-warning) / <alpha-value>)',
  				'warning-soft': 'hsl(var(--state-warning-soft))',
  				'warning-border': 'hsl(var(--state-warning-border))',
  				danger: 'hsl(var(--state-danger) / <alpha-value>)',
  				'danger-soft': 'hsl(var(--state-danger-soft))',
  				'danger-border': 'hsl(var(--state-danger-border))',
  			},
  			qa: {
  				border: 'hsl(var(--qa-border) / <alpha-value>)',
  				'border-hover': 'hsl(var(--qa-border-hover) / <alpha-value>)',
  				text: 'hsl(var(--qa-text) / <alpha-value>)',
  				'text-secondary': 'hsl(var(--qa-text-secondary) / <alpha-value>)',
  				'text-muted': 'hsl(var(--qa-text-muted) / <alpha-value>)',
  				accent: 'hsl(var(--qa-accent) / <alpha-value>)',
  				'accent-hover': 'hsl(var(--qa-accent-hover) / <alpha-value>)',
  			},
  			// ── End app tokens ───────────────────────────────────────────────
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: 0
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: 0
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
