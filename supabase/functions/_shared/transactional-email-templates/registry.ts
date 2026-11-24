/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as welcome } from './welcome.tsx'
import { template as supportNotification } from './support-notification.tsx'
import { template as trialEnded } from './trial-ended.tsx'
import { template as habitReminderTest } from './habit-reminder-test.tsx'
import { template as paystackWebhookAlert } from './paystack-webhook-alert.tsx'
import { template as paymentReceipt } from './payment-receipt.tsx'
import { template as subscriptionLifecycle } from './subscription-lifecycle.tsx'
import { template as adminSubscriptionAlert } from './admin-subscription-alert.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome': welcome,
  'support-notification': supportNotification,
  'trial-ended': trialEnded,
  'habit-reminder-test': habitReminderTest,
  'paystack-webhook-alert': paystackWebhookAlert,
  'payment-receipt': paymentReceipt,
  'subscription-lifecycle': subscriptionLifecycle,
  'admin-subscription-alert': adminSubscriptionAlert,
}

