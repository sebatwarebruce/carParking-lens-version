import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router/routes.jsx';
import PwaPrompt from '@/app/PwaPrompt.jsx';
import ParkingLoadingGate from '@/components/feedback/ParkingLoadingGate.jsx';

export default function App() {
  return (<><RouterProvider router={router} /><PwaPrompt /><ParkingLoadingGate /></>);
}
