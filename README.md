# Patient Health Monitoring System (PHMS).

A modern, web-based dashboard for monitoring patient health metrics in real time. PHMS delivers an intuitive interface for clinicians and caregivers to search, view, and analyze patient data through interactive charts, conversational AI, and a responsive design.

## Table of Contents


- [Patient Health Monitoring System (PHMS)](#patient-health-monitoring-system-phms)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Tech Stack](#tech-stack)
  - [Prerequisites](#prerequisites)
  - [Installation \& Setup](#installation--setup)
  - [Available Scripts](#available-scripts)
  - [Project Structure](#project-structure)
  - [Contributing](#contributing)
  - [License](#license)

---

## key Features

- **Patient Search & List**: Quickly find and browse patient records (`PatientSearch.tsx`, `PatientList.tsx`).
- **Detailed Patient View**: Inspect individual patient profiles, medical info, visits, and location. (`PatientInfo.tsx`, `PatientProfile.tsx`, `PatientLocationMap.tsx`, `PatientVisits.tsx`).
- **Health Metrics Dashboard**: Visualize vital signs with line charts and metric cards (`HealthMetricsGrid.tsx`, `LineChart.tsx`, `MetricCard.tsx`, `CombinedVitalsChart.tsx`, `ECGChart.tsx`).
- **AI-Driven Assistant**: Ask natural-language queries about patient data (`AIAssistant.tsx`).
- **Messaging & Notifications**: Engage in patient-centric chat and alerts (`PatientChat.tsx`, `NotificationPanel.tsx`).
- **Profile & Settings**: Manage user and doctor profiles, customize preferences (`DoctorProfile.tsx`, `UserProfile.tsx`, `Settings.tsx`).
- **Theme Toggle**: Switch between light and dark modes (`ThemeProvider.tsx`, `ThemeToggle.tsx`).
- **Responsive UI**: Built with Tailwind CSS and shadcn-ui components for mobile and desktop.

---

## Tech Stack

- **Frontend**
  - React v18 + TypeScript
  - Vite for fast builds
  - Tailwind CSS & shadcn-ui (Radix) for utility-first styling
  - react-chartjs-2 & Recharts for charts
  - react-router-dom for routing
  - Sonner & Radix UI for notifications & dialogs

- **Backend** (if applicable)
  - [Describe your server stack in `server/` folder]

---

## Prerequisites

- Node.js v14 or higher
- npm (v8+) or Yarn

---

## Installation & Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/patient-health-monitoring-system.git
   cd patient-health-monitoring-system/client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser at [http://localhost:5173](http://localhost:5173).

---

## Available Scripts

From the `client/` directory:

| Command           | Description                      |
| ----------------- | -------------------------------- |
| npm run dev       | Run Vite development server      |
| npm run build     | Build for production (dist/)     |
| npm run preview   | Preview production build locally |
| npm run lint      | Run ESLint                        |

---

## Project Structure

```plaintext
client/
├── public/                 # Static assets (favicon, robots.txt, etc.)
├── src/                    # Application source code
│   ├── components/         # Reusable UI components (cards, buttons, charts)
│   ├── pages/              # Route views (Login, Dashboard, NotFound)
│   ├── contexts/           # React context providers (NotificationContext)
│   ├── hooks/              # Custom hooks (useToast, useMobile)
│   ├── data/               # Mock generators and API clients
│   ├── utils/              # Helper functions and types
│   ├── App.tsx             # Root component & router setup
│   └── main.tsx            # App bootstrap (render into DOM)
├── tailwind.config.ts      # Tailwind CSS configuration
├── vite.config.ts          # Vite build configuration
├── package.json            # Frontend dependencies & scripts
└── README.md               # This file
```

---

## Contributing

Contributions are welcome! To get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/YourFeature`
3. Commit your changes: `git commit -m "feat: add ..."`
4. Push to your branch: `git push origin feature/YourFeature`
5. Open a Pull Request

Please follow the existing code style and include tests where appropriate.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.


## Private team demonstration

For the isolated, sign-in-only synthetic replay deployment, see [Private demo setup](docs/PRIVATE_DEMO.md). This setup disables public signup, live device ingestion and model inference.
