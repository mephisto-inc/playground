import java.util.Scanner;

class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        String name1 = scanner.next(); // Scanning the first name out of 4 names, three more to go
        // continue coding here

        String name2 = scanner.next();
        String name3 = scanner.next();
        String name4 = scanner.next();

        System.out.println(name4 + "\n" + name3 + "\n" + name2 + "\n" + name1);

        scanner.close();
    }
}