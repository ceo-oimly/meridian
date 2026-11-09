export type MailLocale = "en" | "ko";
export interface Mail {
  subject: string;
  text: string;
}

const L = (locale: string): MailLocale => (locale === "ko" ? "ko" : "en");

export function welcomeEmail(locale: string, name: string): Mail {
  return L(locale) === "ko"
    ? {
        subject: "메리디언 뱅크에 오신 것을 환영합니다",
        text: `${name}님, 환영합니다!\n\n계정이 생성되었습니다. 메리디언은 포트폴리오용 데모이며 모든 금액은 가상입니다.\n\n- 메리디언 뱅크`,
      }
    : {
        subject: "Welcome to Meridian Bank",
        text: `Hi ${name},\n\nYour account is ready. Meridian is a portfolio demo and all money is fake.\n\n- Meridian Bank`,
      };
}

export function moneyReceivedEmail(locale: string, name: string, amountText: string, fromName: string): Mail {
  return L(locale) === "ko"
    ? {
        subject: `${amountText}을(를) 받았습니다`,
        text: `${name}님, ${fromName}님으로부터 ${amountText}을(를) 받았습니다.\n\n- 메리디언 뱅크`,
      }
    : {
        subject: `You received ${amountText}`,
        text: `Hi ${name},\n\n${fromName} sent you ${amountText}.\n\n- Meridian Bank`,
      };
}

export function loanDecisionEmail(locale: string, name: string, approved: boolean, note: string | null): Mail {
  const n = note ? note : "";
  return L(locale) === "ko"
    ? {
        subject: approved ? "대출이 승인되었습니다" : "대출 신청 결과 안내",
        text: `${name}님,\n\n${approved ? "대출이 승인되어 지갑에 입금되었습니다." : "죄송합니다. 이번 대출 신청은 승인되지 않았습니다."}${n ? `\n\n메모: ${n}` : ""}\n\n- 메리디언 뱅크`,
      }
    : {
        subject: approved ? "Your loan was approved" : "Update on your loan application",
        text: `Hi ${name},\n\n${approved ? "Your loan was approved and the money is in your wallet." : "Sorry, your loan application was not approved this time."}${n ? `\n\nNote: ${n}` : ""}\n\n- Meridian Bank`,
      };
}

export function externalDecisionEmail(
  locale: string,
  name: string,
  completed: boolean,
  amountText: string,
  note: string | null,
): Mail {
  const n = note ? note : "";
  return L(locale) === "ko"
    ? {
        subject: completed ? "송금이 완료되었습니다" : "송금이 거절되어 환불되었습니다",
        text: `${name}님,\n\n${amountText} 송금이 ${completed ? "완료되었습니다." : "거절되어 지갑으로 환불되었습니다."}${n ? `\n\n메모: ${n}` : ""}\n\n- 메리디언 뱅크`,
      }
    : {
        subject: completed ? "Your bank transfer is complete" : "Your bank transfer was refunded",
        text: `Hi ${name},\n\nYour transfer of ${amountText} was ${completed ? "completed." : "rejected and refunded to your wallet."}${n ? `\n\nNote: ${n}` : ""}\n\n- Meridian Bank`,
      };
}
