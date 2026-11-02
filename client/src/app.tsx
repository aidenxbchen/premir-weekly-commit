import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import NotFound from './pages/NotFound/NotFound';
import AllMilestones from './pages/AllMilestones/AllMilestones';
import AllRatings from './pages/AllRatings/AllRatings';
import ModuleCommitments from './pages/ModuleCommitments/ModuleCommitments';
import OrgManagement from './pages/OrgManagement/OrgManagement';
import PersonalCenter from './pages/PersonalCenter/PersonalCenter';
import WeeklyCommitments from './pages/WeeklyCommitments/WeeklyCommitments';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PersonalCenter />} />
        <Route path="milestones" element={<AllMilestones />} />
        <Route path="commitments" element={<WeeklyCommitments />} />
        <Route path="ratings" element={<ProtectedRoute requiredRoles={['admin']}><AllRatings /></ProtectedRoute>} />
        {/* 所有小组（含软件组/MCU嵌入式/Linux嵌入式）都用同一个模块页，
            模块名从路由参数取，不再有专属页面。 */}
        <Route path="commitments/:module" element={<ModuleCommitments />} />
        <Route
          path="org"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <OrgManagement />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
