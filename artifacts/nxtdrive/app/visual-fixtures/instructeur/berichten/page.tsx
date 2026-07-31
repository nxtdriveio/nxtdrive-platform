import { InstructorMessagesView } from "@/components/instructor/RedesignViews";
import { instructorChatVisualFixture } from "../fixture-data";

export default function InstructorMessagesVisualFixturePage() {
  return (
    <InstructorMessagesView
      data={instructorChatVisualFixture}
      messagesBasePath="/visual-fixtures/instructeur/berichten"
    />
  );
}
