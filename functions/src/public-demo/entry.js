// Dedicated demo deployment entry. The normal Functions entry is unchanged.
export {createAuthTicket,exchangeAuthTicket,cleanupAuthTickets} from '../index.js';
export {enterPublicDemo,resetPublicDemo,resetPublicDemosDaily,publishPublicDemoPdf,downloadPublicDemoPdf,mutatePublicDemo} from './generated.js';
